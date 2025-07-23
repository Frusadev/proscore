"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { useState, useEffect } from "react";
import ky, { HTTPError } from "ky";
import { Github } from "lucide-react";

interface ScoreResponse {
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

interface SavedAnalysis {
  id: string;
  projectName: string;
  projectDescription: string;
  scores: ScoreResponse;
  timestamp: number;
}

interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
}

// localStorage utilities
const STORAGE_KEY = "proscore-analyses";

const saveToLocalStorage = (analysis: SavedAnalysis) => {
  try {
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    const updated = [analysis, ...existing.slice(0, 9)]; // Keep only last 10
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error("Failed to save to localStorage:", error);
  }
};

const getFromLocalStorage = (): SavedAnalysis[] => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch (error) {
    console.error("Failed to load from localStorage:", error);
    return [];
  }
};

const deleteFromLocalStorage = (id: string) => {
  try {
    const existing = getFromLocalStorage();
    const updated = existing.filter((item) => item.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error("Failed to delete from localStorage:", error);
  }
};

export default function Page() {
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [scores, setScores] = useState<ScoreResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFormTouched, setIsFormTouched] = useState(false);
  const [savedAnalyses, setSavedAnalyses] = useState<SavedAnalysis[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [rateLimitInfo, setRateLimitInfo] = useState<RateLimitInfo | null>(
    null,
  );
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null);

  // Load saved analyses on component mount
  useEffect(() => {
    setSavedAnalyses(getFromLocalStorage());
  }, []);

  // Handle retry countdown
  useEffect(() => {
    if (retryCountdown && retryCountdown > 0) {
      const timer = setTimeout(() => {
        setRetryCountdown(retryCountdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (retryCountdown === 0) {
      setRetryCountdown(null);
      setError(null);
    }
  }, [retryCountdown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim() || !projectDescription.trim()) {
      setError("Please fill in both project name and description");
      return;
    }

    setIsLoading(true);
    setError(null);
    setRetryCountdown(null);

    try {
      const response = await ky.post("/api/score", {
        json: {
          projectName: projectName.trim(),
          projectDescription: projectDescription.trim(),
        },
      });

      // Parse rate limit headers from successful response
      const rateLimitHeaders = {
        limit: Number(response.headers.get("X-RateLimit-Limit")) || 10,
        remaining: Number(response.headers.get("X-RateLimit-Remaining")) || 0,
        resetTime:
          Number(response.headers.get("X-RateLimit-Reset")) ||
          Date.now() + 60000,
      };
      setRateLimitInfo(rateLimitHeaders);

      const data = await response.json<ScoreResponse>();
      setScores(data);

      // Save to localStorage
      const savedAnalysis: SavedAnalysis = {
        id: Date.now().toString(),
        projectName: projectName.trim(),
        projectDescription: projectDescription.trim(),
        scores: data,
        timestamp: Date.now(),
      };
      saveToLocalStorage(savedAnalysis);
      setSavedAnalyses(getFromLocalStorage());
    } catch (err: unknown) {
      console.error("Error:", err);

      // Handle different types of errors
      if (err instanceof HTTPError && err.response?.status === 429) {
        try {
          const errorData = (await err.response.json()) as {
            retryAfter?: number;
            error?: string;
          };
          const retryAfter = errorData.retryAfter || 60;

          // Parse rate limit headers from error response
          const rateLimitHeaders = {
            limit: Number(err.response.headers.get("X-RateLimit-Limit")) || 10,
            remaining:
              Number(err.response.headers.get("X-RateLimit-Remaining")) || 0,
            resetTime:
              Number(err.response.headers.get("X-RateLimit-Reset")) ||
              Date.now() + retryAfter * 1000,
            retryAfter: retryAfter,
          };
          setRateLimitInfo(rateLimitHeaders);
          setRetryCountdown(retryAfter);

          setError(
            `Rate limit exceeded. You can make ${rateLimitHeaders.limit} requests per second. Please wait ${retryAfter} seconds before trying again.`,
          );
        } catch {
          setError(
            "Rate limit exceeded. Please wait a moment before trying again.",
          );
          setRetryCountdown(60);
        }
      } else if (err instanceof HTTPError && err.response?.status && err.response.status >= 500) {
        setError("Server error. Please try again later.");
      } else {
        setError(
          "Failed to analyze your project. Please check your connection and try again.",
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    setProjectName("");
    setProjectDescription("");
    setScores(null);
    setError(null);
    setIsFormTouched(false);
    setRateLimitInfo(null);
    setRetryCountdown(null);
  };

  const handleLoadSaved = (analysis: SavedAnalysis) => {
    setProjectName(analysis.projectName);
    setProjectDescription(analysis.projectDescription);
    setScores(analysis.scores);
    setShowSaved(false);
    setIsFormTouched(true);
  };

  const handleDeleteSaved = (id: string) => {
    deleteFromLocalStorage(id);
    setSavedAnalyses(getFromLocalStorage());
  };

  const handleInputChange = (field: "name" | "description", value: string) => {
    setIsFormTouched(true);
    if (field === "name") {
      setProjectName(value);
    } else {
      setProjectDescription(value);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-chart-1";
    if (score >= 60) return "text-chart-4";
    if (score >= 40) return "text-chart-5";
    return "text-destructive";
  };

  const getProgressBarColor = (score: number) => {
    if (score >= 80) return "bg-chart-1";
    if (score >= 60) return "bg-chart-4";
    if (score >= 40) return "bg-chart-5";
    return "bg-destructive";
  };

  return (
    <div className="min-h-screen bg-background p-6 relative overflow-hidden">
      {/* Theme Switcher */}
      <ThemeSwitcher />
      
      {/* GitHub Link */}
      <a
        href="https://github.com/Frusadev/proscore"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed top-6 left-6 z-50 w-10 h-10 p-0 rounded-full bg-card/80 backdrop-blur-sm border border-border/50 hover:bg-accent/50 transition-all duration-300 hover:scale-110 flex items-center justify-center"
        title="View source code on GitHub"
      >
        <Github className="h-5 w-5 text-foreground hover:text-primary transition-colors duration-200" />
      </a>
      
      {/* Animated Background Elements */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-primary/20 rounded-full blur-3xl animate-pulse"></div>
        <div
          className="absolute top-3/4 right-1/4 w-96 h-96 bg-chart-1/15 rounded-full blur-3xl animate-bounce"
          style={{ animationDuration: "3s" }}
        ></div>
        <div
          className="absolute bottom-1/4 left-1/3 w-80 h-80 bg-chart-4/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDelay: "1s" }}
        ></div>
        <div
          className="absolute top-1/2 right-1/3 w-64 h-64 bg-accent/20 rounded-full blur-3xl animate-ping"
          style={{ animationDuration: "4s" }}
        ></div>

        {/* Floating particles */}
        <div
          className="absolute top-10 left-10 w-2 h-2 bg-primary rounded-full animate-ping"
          style={{ animationDelay: "0.5s" }}
        ></div>
        <div
          className="absolute top-20 right-20 w-1 h-1 bg-chart-1 rounded-full animate-pulse"
          style={{ animationDelay: "1.5s" }}
        ></div>
        <div
          className="absolute bottom-20 left-20 w-3 h-3 bg-chart-4 rounded-full animate-bounce"
          style={{ animationDelay: "2s", animationDuration: "2s" }}
        ></div>
        <div
          className="absolute bottom-10 right-10 w-2 h-2 bg-accent rounded-full animate-pulse"
          style={{ animationDelay: "3s" }}
        ></div>
      </div>

      <div className="mx-auto max-w-4xl relative z-10">
        {/* Header */}
        <div className="text-center mb-12 animate-in fade-in slide-in-from-top duration-1000">
          <h1 className="text-4xl md:text-7xl font-black text-foreground mb-4 bg-gradient-to-r from-primary via-chart-1 to-chart-4 bg-clip-text text-transparent animate-gradient-x tracking-tight leading-none">
            PROSCORE
          </h1>
          <p className="text-muted-foreground text-xl md:text-2xl animate-in fade-in slide-in-from-bottom duration-1000 delay-300 font-light tracking-wide">
            Test your project ideas with AI-powered analysis
          </p>
          <div className="w-24 h-1 bg-gradient-to-r from-primary to-chart-1 mx-auto mt-4 rounded-full animate-in fade-in duration-1000 delay-500"></div>
        </div>        {/* Input Form */}
        <Card className="mb-8 backdrop-blur-sm bg-card/80 border-border/50 shadow-2xl animate-in fade-in slide-in-from-left duration-1000 delay-500 hover:shadow-primary/10 transition-all duration-300">
          <CardHeader className="pb-6">
            <CardTitle className="text-2xl font-bold bg-gradient-to-r from-foreground to-primary bg-clip-text text-transparent mb-2 tracking-tight">
              Project Analysis
            </CardTitle>
            <CardDescription className="text-base text-muted-foreground leading-relaxed">
              Enter your project details to get a comprehensive score analysis
              powered by AI
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="group">
                <label
                  htmlFor="project-name"
                  className="block text-sm font-semibold text-foreground mb-3 group-hover:text-primary transition-colors duration-200 tracking-wide uppercase letter-spacing-wider"
                >
                  Project Name
                </label>
                <Input
                  id="project-name"
                  placeholder="Enter your innovative project name..."
                  value={projectName}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  className="w-full transition-all duration-300 hover:border-primary/50 focus:scale-[1.01] text-base py-3 font-medium"
                />
              </div>

              <div className="group">
                <label
                  htmlFor="project-description"
                  className="block text-sm font-semibold text-foreground mb-3 group-hover:text-primary transition-colors duration-200 tracking-wide uppercase letter-spacing-wider"
                >
                  Project Description
                </label>
                <Textarea
                  id="project-description"
                  placeholder="Describe your project idea in detail. What problem does it solve? Who is your target audience? What makes it unique?"
                  value={projectDescription}
                  onChange={(e) =>
                    handleInputChange("description", e.target.value)
                  }
                  className="w-full min-h-32 transition-all duration-300 hover:border-primary/50 focus:scale-[1.01] text-base leading-relaxed font-medium resize-none"
                />
              </div>

              {error && (
                <div
                  className={`text-destructive text-sm p-4 rounded-md border animate-in fade-in slide-in-from-top duration-300 font-medium ${retryCountdown ? "bg-chart-5/10 border-chart-5/20" : "bg-destructive/10 border-destructive/20"}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">
                      {retryCountdown ? "⏱" : "!"}
                    </span>
                    <span>{error}</span>
                  </div>
                  {retryCountdown && (
                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-full bg-secondary rounded-full h-2 overflow-hidden max-w-32">
                          <div
                            className="h-2 bg-chart-5 rounded-full transition-all duration-1000"
                            style={{
                              width: `${((60 - retryCountdown) / 60) * 100}%`,
                            }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground font-mono">
                          {retryCountdown}s
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Rate limit: {rateLimitInfo?.limit || 10} req/sec
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button
                  type="submit"
                  disabled={isLoading || retryCountdown !== null}
                  className="flex-1 bg-gradient-to-r from-primary to-chart-1 hover:from-primary/90 hover:to-chart-1/90 transform hover:scale-105 transition-all duration-300 shadow-lg hover:shadow-primary/25 py-3 text-base font-semibold tracking-wide disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className={isLoading ? "animate-pulse" : ""}>
                    {retryCountdown
                      ? `Wait ${retryCountdown}s`
                      : isLoading
                        ? "Analyzing..."
                        : "Analyze Project"}
                  </span>
                </Button>

                <div className="flex gap-3 sm:gap-3">
                  {isFormTouched && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleClear}
                      className="flex-1 sm:flex-none transform hover:scale-105 transition-all duration-300 animate-in fade-in slide-in-from-right duration-300 py-3 px-6 font-semibold"
                    >
                      Clear
                    </Button>
                  )}

                  {savedAnalyses.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setShowSaved(!showSaved)}
                      className="flex-1 sm:flex-none transform hover:scale-105 transition-all duration-300 py-3 px-6 font-semibold whitespace-nowrap"
                      title="View saved analyses"
                    >
                      <span className="sm:hidden">
                        📁 ({savedAnalyses.length})
                      </span>
                      <span className="hidden sm:inline">
                        📁 Saved ({savedAnalyses.length})
                      </span>
                    </Button>
                  )}
                </div>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Saved Analyses */}
        {showSaved && (
          <Card className="mb-8 backdrop-blur-sm bg-card/80 border-border/50 shadow-2xl animate-in fade-in slide-in-from-top duration-500">
            <CardHeader>
              <CardTitle className="text-xl font-bold bg-gradient-to-r from-foreground to-chart-4 bg-clip-text text-transparent tracking-tight">
                Saved Analyses
              </CardTitle>
              <CardDescription className="text-base text-muted-foreground">
                Load previous project analyses or delete saved entries
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {savedAnalyses.map((analysis) => (
                  <div
                    key={analysis.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-gradient-to-r from-muted/30 to-muted/10 rounded-lg border border-border/30 hover:scale-[1.02] transition-all duration-200 gap-3 sm:gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-foreground truncate">
                        {analysis.projectName}
                      </h4>
                      <p className="text-sm text-muted-foreground line-clamp-2 sm:truncate">
                        {analysis.projectDescription}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(analysis.timestamp).toLocaleDateString()} at{" "}
                        {new Date(analysis.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                    <div className="flex gap-2 sm:ml-4 w-full sm:w-auto">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleLoadSaved(analysis)}
                        className="text-xs flex-1 sm:flex-none"
                      >
                        Load
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteSaved(analysis.id)}
                        className="text-xs text-destructive hover:text-destructive flex-1 sm:flex-none"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Loading State */}
        {isLoading && (
          <Card className="mb-8 backdrop-blur-sm bg-card/80 border-border/50 shadow-2xl animate-in fade-in scale-in duration-500">
            <CardContent className="p-8">
              <div className="flex flex-col items-center space-y-6">
                <div className="flex space-x-2">
                  <div className="w-4 h-4 bg-primary rounded-full animate-bounce"></div>
                  <div
                    className="w-4 h-4 bg-chart-1 rounded-full animate-bounce"
                    style={{ animationDelay: "0.1s" }}
                  ></div>
                  <div
                    className="w-4 h-4 bg-chart-4 rounded-full animate-bounce"
                    style={{ animationDelay: "0.2s" }}
                  ></div>
                </div>
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-foreground mb-2 tracking-wide">
                    Analyzing Your Project
                  </h3>
                  <p className="text-muted-foreground animate-pulse font-medium">
                    AI is evaluating your idea across multiple criteria...
                  </p>
                </div>
                <div className="w-full bg-secondary rounded-full h-3 overflow-hidden">
                  <div className="h-3 bg-gradient-to-r from-primary via-chart-1 to-chart-4 rounded-full animate-pulse"></div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Results */}
        {scores && (
          <Card className="backdrop-blur-sm bg-card/80 border-border/50 shadow-2xl animate-in fade-in slide-in-from-right duration-1000 hover:shadow-chart-1/10 transition-all duration-300">
            <CardHeader className="pb-6">
              <CardTitle className="text-2xl font-bold bg-gradient-to-r from-foreground to-chart-1 bg-clip-text text-transparent mb-2 tracking-tight">
                Analysis Results
              </CardTitle>
              <CardDescription className="text-base text-muted-foreground leading-relaxed">
                Your project scores across different criteria with detailed
                insights
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="bg-gradient-to-br from-card to-card/50 border border-border rounded-xl p-6 hover:scale-105 transition-all duration-300 hover:shadow-lg hover:shadow-primary/10 animate-in fade-in slide-in-from-bottom duration-500 delay-100">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-sm font-bold text-muted-foreground uppercase tracking-widest">
                      Name Quality
                    </span>
                    <span
                      className={`text-3xl font-black ${getScoreColor(scores.nameScore)} animate-in zoom-in duration-500 delay-300 tabular-nums`}
                    >
                      {scores.nameScore}
                    </span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-3 overflow-hidden">
                    <div
                      className={`h-3 rounded-full transition-all duration-1000 delay-500 ${getProgressBarColor(scores.nameScore)}`}
                      style={{ width: `${scores.nameScore}%` }}
                    />
                  </div>
                </div>

                <div className="bg-gradient-to-br from-card to-card/50 border border-border rounded-xl p-6 hover:scale-105 transition-all duration-300 hover:shadow-lg hover:shadow-primary/10 animate-in fade-in slide-in-from-bottom duration-500 delay-200">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-sm font-bold text-muted-foreground uppercase tracking-widest">
                      Description
                    </span>
                    <span
                      className={`text-3xl font-black ${getScoreColor(scores.descriptionScore)} animate-in zoom-in duration-500 delay-400 tabular-nums`}
                    >
                      {scores.descriptionScore}
                    </span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-3 overflow-hidden">
                    <div
                      className={`h-3 rounded-full transition-all duration-1000 delay-600 ${getProgressBarColor(scores.descriptionScore)}`}
                      style={{ width: `${scores.descriptionScore}%` }}
                    />
                  </div>
                </div>

                <div className="bg-gradient-to-br from-card to-card/50 border border-border rounded-xl p-6 hover:scale-105 transition-all duration-300 hover:shadow-lg hover:shadow-primary/10 animate-in fade-in slide-in-from-bottom duration-500 delay-300">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-sm font-bold text-muted-foreground uppercase tracking-widest">
                      Monetization
                    </span>
                    <span
                      className={`text-3xl font-black ${getScoreColor(scores.monetizabilityScore)} animate-in zoom-in duration-500 delay-500 tabular-nums`}
                    >
                      {scores.monetizabilityScore}
                    </span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-3 overflow-hidden">
                    <div
                      className={`h-3 rounded-full transition-all duration-1000 delay-700 ${getProgressBarColor(scores.monetizabilityScore)}`}
                      style={{ width: `${scores.monetizabilityScore}%` }}
                    />
                  </div>
                </div>

                <div className="bg-gradient-to-br from-card to-card/50 border border-border rounded-xl p-6 hover:scale-105 transition-all duration-300 hover:shadow-lg hover:shadow-primary/10 animate-in fade-in slide-in-from-bottom duration-500 delay-400">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-sm font-bold text-muted-foreground uppercase tracking-widest">
                      Usefulness
                    </span>
                    <span
                      className={`text-3xl font-black ${getScoreColor(scores.usefulnessScore)} animate-in zoom-in duration-500 delay-600 tabular-nums`}
                    >
                      {scores.usefulnessScore}
                    </span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-3 overflow-hidden">
                    <div
                      className={`h-3 rounded-full transition-all duration-1000 delay-800 ${getProgressBarColor(scores.usefulnessScore)}`}
                      style={{ width: `${scores.usefulnessScore}%` }}
                    />
                  </div>
                </div>

                <div className="bg-gradient-to-br from-card to-card/50 border border-border rounded-xl p-6 hover:scale-105 transition-all duration-300 hover:shadow-lg hover:shadow-primary/10 animate-in fade-in slide-in-from-bottom duration-500 delay-500">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-sm font-bold text-muted-foreground uppercase tracking-widest">
                      Fun Factor
                    </span>
                    <span
                      className={`text-3xl font-black ${getScoreColor(scores.funScore)} animate-in zoom-in duration-500 delay-700 tabular-nums`}
                    >
                      {scores.funScore}
                    </span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-3 overflow-hidden">
                    <div
                      className={`h-3 rounded-full transition-all duration-1000 delay-900 ${getProgressBarColor(scores.funScore)}`}
                      style={{ width: `${scores.funScore}%` }}
                    />
                  </div>
                </div>

                <div className="bg-gradient-to-br from-card to-card/50 border border-border rounded-xl p-6 hover:scale-105 transition-all duration-300 hover:shadow-lg hover:shadow-primary/10 animate-in fade-in slide-in-from-bottom duration-500 delay-600">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-sm font-bold text-muted-foreground uppercase tracking-widest">
                      Simplicity
                    </span>
                    <span
                      className={`text-3xl font-black ${getScoreColor(scores.simplicityScore)} animate-in zoom-in duration-500 delay-800 tabular-nums`}
                    >
                      {scores.simplicityScore}
                    </span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-3 overflow-hidden">
                    <div
                      className={`h-3 rounded-full transition-all duration-1000 delay-1000 ${getProgressBarColor(scores.simplicityScore)}`}
                      style={{ width: `${scores.simplicityScore}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* AI Feedback Section */}
              <div className="mt-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {/* Strengths */}
                  <Card className="bg-gradient-to-br from-chart-1/10 to-chart-1/5 border-chart-1/20 animate-in fade-in slide-in-from-left duration-500 delay-800">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg font-bold text-chart-1 flex items-center gap-2">
                        <span className="text-xl">✨</span>
                        Strengths
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {scores.feedback.strengths.map((strength, index) => (
                          <li
                            key={index}
                            className="text-sm text-foreground flex items-start gap-2 animate-in fade-in duration-300"
                            style={{ animationDelay: `${900 + index * 100}ms` }}
                          >
                            <span className="text-chart-1 mt-1">•</span>
                            <span className="leading-relaxed">{strength}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>

                  {/* Areas for Improvement */}
                  <Card className="bg-gradient-to-br from-chart-5/10 to-chart-5/5 border-chart-5/20 animate-in fade-in slide-in-from-bottom duration-500 delay-900">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg font-bold text-chart-5 flex items-center gap-2">
                        <span className="text-xl">🔧</span>
                        Improvements
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {scores.feedback.improvements.map(
                          (improvement, index) => (
                            <li
                              key={index}
                              className="text-sm text-foreground flex items-start gap-2 animate-in fade-in duration-300"
                              style={{
                                animationDelay: `${1000 + index * 100}ms`,
                              }}
                            >
                              <span className="text-chart-5 mt-1">•</span>
                              <span className="leading-relaxed">
                                {improvement}
                              </span>
                            </li>
                          ),
                        )}
                      </ul>
                    </CardContent>
                  </Card>

                  {/* Recommendations */}
                  <Card className="bg-gradient-to-br from-chart-4/10 to-chart-4/5 border-chart-4/20 animate-in fade-in slide-in-from-right duration-500 delay-1000 md:col-span-2 lg:col-span-1">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg font-bold text-chart-4 flex items-center gap-2">
                        <span className="text-xl">💡</span>
                        Recommendations
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {scores.feedback.recommendations.map(
                          (recommendation, index) => (
                            <li
                              key={index}
                              className="text-sm text-foreground flex items-start gap-2 animate-in fade-in duration-300"
                              style={{
                                animationDelay: `${1100 + index * 100}ms`,
                              }}
                            >
                              <span className="text-chart-4 mt-1">•</span>
                              <span className="leading-relaxed">
                                {recommendation}
                              </span>
                            </li>
                          ),
                        )}
                      </ul>
                    </CardContent>
                  </Card>
                </div>
              </div>

              <div className="mt-8 p-4 sm:p-8 bg-gradient-to-r from-muted/50 to-muted/30 rounded-xl border border-border/50 animate-in fade-in slide-in-from-bottom duration-500 delay-700 hover:scale-[1.02] transition-all duration-300 relative overflow-hidden">
                {/* Decorative background elements */}
                <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-primary/10 to-chart-1/10 rounded-full blur-xl"></div>
                <div className="absolute bottom-0 left-0 w-16 h-16 bg-gradient-to-tr from-chart-4/10 to-accent/10 rounded-full blur-xl"></div>

                <div className="relative z-10">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl sm:text-3xl">
                        {(() => {
                          const avgScore =
                            (scores.nameScore +
                              scores.descriptionScore +
                              scores.monetizabilityScore +
                              scores.usefulnessScore +
                              scores.funScore +
                              scores.simplicityScore) /
                            6;
                          if (avgScore >= 80) return "🚀";
                          if (avgScore >= 60) return "✨";
                          if (avgScore >= 40) return "💡";
                          return "🔧";
                        })()}
                      </span>
                      <h3 className="text-lg sm:text-xl font-bold text-foreground bg-gradient-to-r from-foreground to-primary bg-clip-text text-transparent tracking-tight">
                        Overall Assessment
                      </h3>
                    </div>
                    <div className="hidden sm:block flex-1 h-px bg-gradient-to-r from-border to-transparent"></div>
                  </div>

                  <div className="mb-6">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-3 gap-1 sm:gap-0">
                      <span className="text-xs sm:text-sm font-bold text-muted-foreground uppercase tracking-widest">
                        Overall Score
                      </span>
                      <span
                        className={`text-xl sm:text-2xl font-black ${getScoreColor(Math.round((scores.nameScore + scores.descriptionScore + scores.monetizabilityScore + scores.usefulnessScore + scores.funScore + scores.simplicityScore) / 6))} tabular-nums`}
                      >
                        {Math.round(
                          (scores.nameScore +
                            scores.descriptionScore +
                            scores.monetizabilityScore +
                            scores.usefulnessScore +
                            scores.funScore +
                            scores.simplicityScore) /
                            6,
                        )}
                        /100
                      </span>
                    </div>
                    <div className="w-full bg-secondary rounded-full h-3 sm:h-4 overflow-hidden">
                      <div
                        className={`h-3 sm:h-4 rounded-full transition-all duration-1500 delay-500 ${getProgressBarColor(Math.round((scores.nameScore + scores.descriptionScore + scores.monetizabilityScore + scores.usefulnessScore + scores.funScore + scores.simplicityScore) / 6))}`}
                        style={{
                          width: `${(scores.nameScore + scores.descriptionScore + scores.monetizabilityScore + scores.usefulnessScore + scores.funScore + scores.simplicityScore) / 6}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="bg-background/50 rounded-lg p-3 sm:p-4 border border-border/30">
                    <p className="text-muted-foreground text-sm sm:text-base animate-in fade-in duration-500 delay-1000 leading-relaxed font-medium break-words">
                      {scores.feedback.overallFeedback}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Floating Action Elements */}
        {scores && (
          <div className="fixed bottom-6 right-6 z-20">
            <Button
              onClick={handleClear}
              variant="outline"
              className="rounded-full w-14 h-14 p-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-110 bg-card/80 backdrop-blur-sm border-border/50 font-bold text-lg"
              title="Start over with a new analysis"
            >
              <span className="text-xl">↻</span>
            </Button>
          </div>
        )}

        {/* Footer */}
        <footer className="mt-16 text-center animate-in fade-in duration-1000 delay-1000">
          <div className="py-8 border-t border-border/50">
            <p className="text-muted-foreground text-sm mb-2">
              Made with ❤️ by{" "}
              <a
                href="https://github.com/Frusadev"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-primary hover:text-primary/80 transition-colors duration-200"
              >
                Frusadev
              </a>
            </p>
            <p className="text-muted-foreground text-xs">
              Contact:{" "}
              <a
                href="mailto:frusadev@gmail.com"
                className="text-primary hover:text-primary/80 transition-colors duration-200"
              >
                frusadev@gmail.com
              </a>
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
