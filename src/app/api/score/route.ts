import { NextResponse, type NextRequest } from "next/server";
import { GoogleGenAI } from "@google/genai";

// Rate limiting configuration
const RATE_LIMIT = 10; // requests per second
const RATE_LIMIT_WINDOW = 1000; // 1 second in milliseconds

// In-memory store for rate limiting
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (now > value.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 60000); // Clean up every minute

function getRateLimitKey(request: NextRequest): string {
  // Try multiple headers to get the real IP address
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const cfConnectingIp = request.headers.get("cf-connecting-ip"); // Cloudflare
  const xClientIp = request.headers.get("x-client-ip");

  // Priority order: CF-Connecting-IP, X-Forwarded-For, X-Real-IP, X-Client-IP, fallback
  if (cfConnectingIp) return cfConnectingIp;
  if (forwarded) {
    // X-Forwarded-For can be a comma-separated list, take the first one
    return forwarded.split(",")[0].trim();
  }
  if (realIp) return realIp;
  if (xClientIp) return xClientIp;

  // Fallback - in production this would be the actual client IP
  // For development, we'll use a default identifier
  return "unknown-client";
}

function checkRateLimit(key: string): {
  allowed: boolean;
  resetTime?: number;
  remaining?: number;
} {
  const now = Date.now();
  const windowEnd = now + RATE_LIMIT_WINDOW;

  const current = rateLimitStore.get(key);

  if (!current || now > current.resetTime) {
    // First request or window has reset
    rateLimitStore.set(key, { count: 1, resetTime: windowEnd });
    return { allowed: true, resetTime: windowEnd, remaining: RATE_LIMIT - 1 };
  }

  if (current.count >= RATE_LIMIT) {
    // Rate limit exceeded
    return { allowed: false, resetTime: current.resetTime, remaining: 0 };
  }

  // Increment count
  current.count++;
  rateLimitStore.set(key, current);
  return {
    allowed: true,
    resetTime: current.resetTime,
    remaining: RATE_LIMIT - current.count,
  };
}

export interface ScoreRequest {
  projectName: string;
  projectDescription: string;
}

export interface ScoreResponse {
  nameScore: number;
  descriptionScore: number;
  monetizabilityScore: number;
  usefulnessScore: number;
  funScore: number;
  simplicityScore: number;
  feedback: {
    strengths: string[];
    improvements: string[];
    recommendations: string[];
    overallFeedback: string;
  };
}

export async function POST(request: NextRequest) {
  // Check rate limit
  const rateLimitKey = getRateLimitKey(request);
  const rateLimitResult = checkRateLimit(rateLimitKey);

  if (!rateLimitResult.allowed) {
    const retryAfter = Math.ceil(
      (rateLimitResult.resetTime! - Date.now()) / 1000,
    );
    return NextResponse.json(
      {
        error: "Rate limit exceeded. Too many requests.",
        retryAfter: retryAfter,
      },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": RATE_LIMIT.toString(),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": rateLimitResult.resetTime!.toString(),
          "Retry-After": retryAfter.toString(),
        },
      },
    );
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GENAI_API_KEY });
    const body: ScoreRequest = await request.json();
    const model = "gemini-2.0-flash";

    // Generate all scores in parallel
    const [
      nameScore,
      descriptionScore,
      monetizabilityScore,
      usefulnessScore,
      funScore,
      simplicityScore,
    ] = await Promise.all([
      ai.models.generateContent({
        model: model,
        contents: `Evaluate the project name based on its uniqueness, relevance, and appeal. Provide a score from 0 to 100. BE STRAIGHTFORWARD and DO NOT EXPLAIN YOUR ANSWER DO NOT comment or explain your answer, JUST GIVE A NUMBER. Project name: ${body.projectName}, project description: ${body.projectDescription}`,
      }),
      ai.models.generateContent({
        model: model,
        contents: `Evaluate the project description based on its clarity, completeness, and engagement. Provide a score from 0 to 100 DO NOT comment or explain your answer, JUST GIVE A NUMBER. Project name: ${body.projectName}, project description: ${body.projectDescription}`,
      }),
      ai.models.generateContent({
        model: model,
        contents: `Evaluate the project based on its potential for monetization. Provide a score from 0 to 100 DO NOT comment or explain your answer, JUST GIVE A NUMBER. Project name: ${body.projectName}, project description: ${body.projectDescription}`,
      }),
      ai.models.generateContent({
        model: model,
        contents: `Evaluate the project based on its usefulness to users. Provide a score from 0 to 100 DO NOT comment or explain your answer, JUST GIVE A NUMBER. Project name: ${body.projectName}, project description: ${body.projectDescription}`,
      }),
      ai.models.generateContent({
        model: model,
        contents: `Evaluate the project based on its fun factor and user engagement. Provide a score from 0 to 100 DO NOT comment or explain your answer, JUST GIVE A NUMBER. Project name: ${body.projectName}, project description: ${body.projectDescription}`,
      }),
      ai.models.generateContent({
        model: model,
        contents: `Evaluate the project based on its simplicity and ease of use. Provide a score from 0 to 100 DO NOT comment or explain your answer, JUST GIVE A NUMBER. Project name: ${body.projectName}, project description: ${body.projectDescription}`,
      }),
    ]);

    // Parse scores
    const scores = {
      nameScore: Number.parseFloat(nameScore.text ?? "0"),
      descriptionScore: Number.parseFloat(descriptionScore.text ?? "0"),
      monetizabilityScore: Number.parseFloat(monetizabilityScore.text ?? "0"),
      usefulnessScore: Number.parseFloat(usefulnessScore.text ?? "0"),
      funScore: Number.parseFloat(funScore.text ?? "0"),
      simplicityScore: Number.parseFloat(simplicityScore.text ?? "0"),
    };

    // Generate detailed feedback based on scores
    const [strengthsResponse, improvementsResponse, recommendationsResponse] = await Promise.all([
      ai.models.generateContent({
        model: model,
        contents: `Based on this project analysis, list 3 key strengths. Return only the strengths as separate lines, no numbering, no extra text.
        
        Project Name: ${body.projectName}
        Project Description: ${body.projectDescription}
        
        Scores:
        - Name Quality: ${scores.nameScore}/100
        - Description Quality: ${scores.descriptionScore}/100
        - Monetization Potential: ${scores.monetizabilityScore}/100
        - Usefulness: ${scores.usefulnessScore}/100
        - Fun Factor: ${scores.funScore}/100
        - Simplicity: ${scores.simplicityScore}/100`,
      }),
      ai.models.generateContent({
        model: model,
        contents: `Based on this project analysis, list 3 areas for improvement. Return only the improvements as separate lines, no numbering, no extra text.
        
        Project Name: ${body.projectName}
        Project Description: ${body.projectDescription}
        
        Scores:
        - Name Quality: ${scores.nameScore}/100
        - Description Quality: ${scores.descriptionScore}/100
        - Monetization Potential: ${scores.monetizabilityScore}/100
        - Usefulness: ${scores.usefulnessScore}/100
        - Fun Factor: ${scores.funScore}/100
        - Simplicity: ${scores.simplicityScore}/100`,
      }),
      ai.models.generateContent({
        model: model,
        contents: `Based on this project analysis, provide 3 actionable recommendations. Return only the recommendations as separate lines, no numbering, no extra text.
        
        Project Name: ${body.projectName}
        Project Description: ${body.projectDescription}
        
        Scores:
        - Name Quality: ${scores.nameScore}/100
        - Description Quality: ${scores.descriptionScore}/100
        - Monetization Potential: ${scores.monetizabilityScore}/100
        - Usefulness: ${scores.usefulnessScore}/100
        - Fun Factor: ${scores.funScore}/100
        - Simplicity: ${scores.simplicityScore}/100`,
      }),
    ]);

    // Generate overall feedback
    const overallFeedbackResponse = await ai.models.generateContent({
      model: model,
      contents: `Based on this project analysis, provide a comprehensive 2-3 sentence summary of the project's potential and key insights. Be specific and actionable.
      
      Project Name: ${body.projectName}
      Project Description: ${body.projectDescription}
      
      Scores:
      - Name Quality: ${scores.nameScore}/100
      - Description Quality: ${scores.descriptionScore}/100
      - Monetization Potential: ${scores.monetizabilityScore}/100
      - Usefulness: ${scores.usefulnessScore}/100
      - Fun Factor: ${scores.funScore}/100
      - Simplicity: ${scores.simplicityScore}/100`,
    });

    // Parse the text responses into arrays
    const parseTextToArray = (text: string): string[] => {
      return text
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.match(/^\d+\.?\s/)) // Remove numbering
        .slice(0, 3); // Ensure max 3 items
    };

    const feedback = {
      strengths: parseTextToArray(strengthsResponse.text ?? ""),
      improvements: parseTextToArray(improvementsResponse.text ?? ""),
      recommendations: parseTextToArray(recommendationsResponse.text ?? ""),
      overallFeedback: (overallFeedbackResponse.text ?? "").trim() || "Your project has been analyzed across six key criteria. Review the individual scores to identify areas for improvement.",
    };

    // Fallback if any array is empty
    if (feedback.strengths.length === 0) {
      feedback.strengths = ["Project shows potential in multiple areas"];
    }
    if (feedback.improvements.length === 0) {
      feedback.improvements = ["Consider refining areas with lower scores"];
    }
    if (feedback.recommendations.length === 0) {
      feedback.recommendations = ["Focus on strengthening core value proposition"];
    }

    // Include rate limit headers in successful response
    const response = NextResponse.json<ScoreResponse>({
      ...scores,
      feedback,
    });

    response.headers.set("X-RateLimit-Limit", RATE_LIMIT.toString());
    response.headers.set(
      "X-RateLimit-Remaining",
      rateLimitResult.remaining!.toString(),
    );
    response.headers.set(
      "X-RateLimit-Reset",
      rateLimitResult.resetTime!.toString(),
    );

    return response;
  } catch (error) {
    console.error("Error processing request:", error);
    return NextResponse.json(
      { error: "Internal server error. Please try again later." },
      {
        status: 500,
        headers: {
          "X-RateLimit-Limit": RATE_LIMIT.toString(),
          "X-RateLimit-Remaining": rateLimitResult.remaining!.toString(),
          "X-RateLimit-Reset": rateLimitResult.resetTime!.toString(),
        },
      },
    );
  }
}
