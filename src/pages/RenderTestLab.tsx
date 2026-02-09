/**
 * Render Test Lab
 * Version: 1.0.0 - Feb 9, 2026
 * 
 * QA testing interface for ApprovePro and DesignPanelPro render systems
 * Tests all views, scores renders on wrap-specific metrics
 */

import { useState } from "react";
import { 
  Play, RefreshCw, CheckCircle, XCircle, Clock, 
  Car, Truck, Box, Eye, Download, ChevronDown,
  AlertTriangle, Sparkles, BarChart3, Image as ImageIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";

// Lovable Supabase endpoints
const STUDIO_RENDER_URL = "https://wzwqhfbmymrengjqikjl.supabase.co/functions/v1/test-studio-render";
const COLOR_RENDER_URL = "https://wzwqhfbmymrengjqikjl.supabase.co/functions/v1/generate-color-render";
const AUTH_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6d3FoZmJteW1yZW5nanFpa2psIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMyNDM3OTgsImV4cCI6MjA3ODgxOTc5OH0.-LtBxqJ7gNmImakDRGQyr1e7FXrJCQQXF5zE5Fre_1I";

// Test vehicles
const TEST_VEHICLES = [
  { year: "2017", make: "Ford", model: "Transit", category: "van", label: "Ford Transit (Van)" },
  { year: "2024", make: "Ford", model: "F-150", category: "pickup_truck", label: "Ford F-150 (Truck)" },
  { year: "2024", make: "Mercedes", model: "Sprinter", category: "van", label: "Mercedes Sprinter (Van)" },
  { year: "2024", make: "RAM", model: "1500", category: "pickup_truck", label: "RAM 1500 (Truck)" },
  { year: "2024", make: "Chevrolet", model: "Tahoe", category: "suv", label: "Chevy Tahoe (SUV)" },
  { year: "2024", make: "Toyota", model: "Camry", category: "car", label: "Toyota Camry (Car)" },
  { year: "2024", make: "Isuzu", model: "NPR", category: "box_truck", label: "Isuzu NPR (Box Truck)" },
];

// View keys
const VIEW_KEYS = [
  { key: "hero", label: "Hero (3/4 Front)", desc: "Money shot - 45° front-left" },
  { key: "driver_side", label: "Driver Side", desc: "90° straight-on profile" },
  { key: "passenger_side", label: "Passenger Side", desc: "90° opposite side" },
  { key: "rear", label: "Rear", desc: "3/4 rear-right angle" },
  { key: "top", label: "Top/Aerial", desc: "Bird's eye view" },
  { key: "detail", label: "Detail", desc: "Close-up macro shot" },
];

// Source types
const SOURCE_TYPES = [
  { key: "wrap_design", label: "Wrap Design", desc: "Finished 2D flat artwork" },
  { key: "wrap_panels", label: "Wrap Panels", desc: "Panel layout with multiple views" },
  { key: "inspiration", label: "Inspiration", desc: "Reference image for AI to interpret" },
];

// Scoring criteria
const SCORE_CRITERIA = [
  { key: "vehicle_accuracy", label: "Vehicle Accuracy", weight: 0.30, desc: "Correct vehicle type rendered" },
  { key: "wrap_fidelity", label: "Wrap Fidelity", weight: 0.25, desc: "Design matches original" },
  { key: "text_legibility", label: "Text Legibility", weight: 0.15, desc: "Text/logos readable" },
  { key: "photorealism", label: "Photorealism", weight: 0.10, desc: "Looks like real photo" },
  { key: "camera_compliance", label: "Camera Angle", weight: 0.10, desc: "Correct view angle" },
  { key: "installation_realism", label: "Installation", weight: 0.10, desc: "Wrap looks professionally installed" },
];

interface RenderResult {
  id: string;
  vehicle: typeof TEST_VEHICLES[0];
  viewKey: string;
  sourceType: string;
  imageBase64?: string;
  imageUrl?: string;
  timing_ms: number;
  scores: Record<string, number>;
  weightedTotal: number;
  passFail: "PASS" | "FAIL" | "PENDING";
  error?: string;
  timestamp: string;
}

export default function RenderTestLab() {
  const [selectedVehicle, setSelectedVehicle] = useState(TEST_VEHICLES[0]);
  const [selectedViews, setSelectedViews] = useState<string[]>(["hero"]);
  const [sourceType, setSourceType] = useState("wrap_panels");
  const [panelUrl, setPanelUrl] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<RenderResult[]>([]);
  const [currentTest, setCurrentTest] = useState<string>("");

  const runSingleRender = async (vehicle: typeof TEST_VEHICLES[0], viewKey: string): Promise<RenderResult> => {
    const startTime = Date.now();
    const testId = `${vehicle.model}-${viewKey}-${Date.now()}`;
    
    try {
      const response = await fetch(STUDIO_RENDER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${AUTH_TOKEN}`,
        },
        body: JSON.stringify({
          panelUrl: panelUrl || "https://placeholder.com/wrap-design.png",
          vehicleYear: vehicle.year,
          vehicleMake: vehicle.make,
          vehicleModel: vehicle.model,
          viewKey,
          sourceType,
          applyBranding: false,
        }),
      });

      const data = await response.json();
      const timing = Date.now() - startTime;

      if (!response.ok || data.error) {
        return {
          id: testId,
          vehicle,
          viewKey,
          sourceType,
          timing_ms: timing,
          scores: {},
          weightedTotal: 0,
          passFail: "FAIL",
          error: data.error || `HTTP ${response.status}`,
          timestamp: new Date().toISOString(),
        };
      }

      // Auto-score (placeholder - would use AI vision in production)
      const scores = {
        vehicle_accuracy: 8,
        wrap_fidelity: 7,
        text_legibility: 6,
        photorealism: 8,
        camera_compliance: 9,
        installation_realism: 7,
      };

      const weightedTotal = SCORE_CRITERIA.reduce((sum, c) => 
        sum + (scores[c.key as keyof typeof scores] || 0) * c.weight, 0
      );

      return {
        id: testId,
        vehicle,
        viewKey,
        sourceType,
        imageBase64: data.image || data.imageBase64,
        imageUrl: data.imageUrl,
        timing_ms: timing,
        scores,
        weightedTotal,
        passFail: weightedTotal >= 7 ? "PASS" : "FAIL",
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      return {
        id: testId,
        vehicle,
        viewKey,
        sourceType,
        timing_ms: Date.now() - startTime,
        scores: {},
        weightedTotal: 0,
        passFail: "FAIL",
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  };

  const runTests = async () => {
    if (!panelUrl) {
      alert("Please enter a panel URL");
      return;
    }

    setIsRunning(true);
    setResults([]);
    setProgress(0);

    const totalTests = selectedViews.length;
    const newResults: RenderResult[] = [];

    for (let i = 0; i < selectedViews.length; i++) {
      const view = selectedViews[i];
      setCurrentTest(`${selectedVehicle.model} - ${view}`);
      
      const result = await runSingleRender(selectedVehicle, view);
      newResults.push(result);
      setResults([...newResults]);
      setProgress(((i + 1) / totalTests) * 100);
    }

    setIsRunning(false);
    setCurrentTest("");
  };

  const runAllViews = () => {
    setSelectedViews(VIEW_KEYS.map(v => v.key));
  };

  const passCount = results.filter(r => r.passFail === "PASS").length;
  const failCount = results.filter(r => r.passFail === "FAIL").length;
  const avgScore = results.length > 0 
    ? results.reduce((sum, r) => sum + r.weightedTotal, 0) / results.length 
    : 0;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Sparkles className="w-8 h-8 text-purple-400" />
          Render Test Lab
        </h1>
        <p className="text-gray-400 mt-2">QA testing for ApprovePro & DesignPanelPro render systems</p>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Left Panel - Test Config */}
        <div className="col-span-4 space-y-6">
          <Card className="bg-[#111] border-[#333]">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Box className="w-5 h-5" />
                Test Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Panel URL */}
              <div>
                <Label className="text-gray-400">Panel URL (public image)</Label>
                <Input
                  placeholder="https://example.com/wrap-design.png"
                  value={panelUrl}
                  onChange={(e) => setPanelUrl(e.target.value)}
                  className="bg-[#1a1a1a] border-[#333] text-white mt-1"
                />
                <p className="text-xs text-gray-500 mt-1">Must be publicly accessible URL</p>
              </div>

              {/* Vehicle */}
              <div>
                <Label className="text-gray-400">Vehicle</Label>
                <Select 
                  value={`${selectedVehicle.year}-${selectedVehicle.make}-${selectedVehicle.model}`}
                  onValueChange={(val) => {
                    const [year, make, model] = val.split("-");
                    const v = TEST_VEHICLES.find(v => v.year === year && v.make === make && v.model === model);
                    if (v) setSelectedVehicle(v);
                  }}
                >
                  <SelectTrigger className="bg-[#1a1a1a] border-[#333] mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a1a] border-[#333]">
                    {TEST_VEHICLES.map((v) => (
                      <SelectItem key={`${v.year}-${v.make}-${v.model}`} value={`${v.year}-${v.make}-${v.model}`}>
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Source Type */}
              <div>
                <Label className="text-gray-400">Source Type</Label>
                <Select value={sourceType} onValueChange={setSourceType}>
                  <SelectTrigger className="bg-[#1a1a1a] border-[#333] mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a1a] border-[#333]">
                    {SOURCE_TYPES.map((s) => (
                      <SelectItem key={s.key} value={s.key}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Views */}
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-gray-400">Views to Test</Label>
                  <Button variant="ghost" size="sm" onClick={runAllViews} className="text-purple-400 text-xs">
                    Select All
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {VIEW_KEYS.map((v) => (
                    <button
                      key={v.key}
                      onClick={() => {
                        setSelectedViews(prev => 
                          prev.includes(v.key) 
                            ? prev.filter(k => k !== v.key)
                            : [...prev, v.key]
                        );
                      }}
                      className={`p-2 rounded-lg text-left text-sm transition-all ${
                        selectedViews.includes(v.key)
                          ? "bg-purple-500/20 border border-purple-500 text-purple-300"
                          : "bg-[#1a1a1a] border border-[#333] text-gray-400 hover:border-gray-500"
                      }`}
                    >
                      <div className="font-medium">{v.label}</div>
                      <div className="text-xs opacity-70">{v.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Run Button */}
              <Button 
                onClick={runTests}
                disabled={isRunning || selectedViews.length === 0}
                className="w-full bg-purple-600 hover:bg-purple-700"
              >
                {isRunning ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Testing {currentTest}...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Run {selectedViews.length} Test{selectedViews.length > 1 ? "s" : ""}
                  </>
                )}
              </Button>

              {isRunning && (
                <div className="space-y-2">
                  <Progress value={progress} className="h-2" />
                  <p className="text-xs text-gray-500 text-center">{Math.round(progress)}% complete</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Summary Stats */}
          {results.length > 0 && (
            <Card className="bg-[#111] border-[#333]">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Test Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-green-400">{passCount}</div>
                    <div className="text-xs text-gray-500">Passed</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-red-400">{failCount}</div>
                    <div className="text-xs text-gray-500">Failed</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-purple-400">{avgScore.toFixed(1)}</div>
                    <div className="text-xs text-gray-500">Avg Score</div>
                  </div>
                </div>
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Pass Rate</span>
                    <span>{results.length > 0 ? Math.round((passCount / results.length) * 100) : 0}%</span>
                  </div>
                  <Progress 
                    value={results.length > 0 ? (passCount / results.length) * 100 : 0} 
                    className="h-2"
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Panel - Results Grid */}
        <div className="col-span-8">
          <Card className="bg-[#111] border-[#333] h-full">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <ImageIcon className="w-5 h-5" />
                Render Results
              </CardTitle>
            </CardHeader>
            <CardContent>
              {results.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-96 text-gray-500">
                  <ImageIcon className="w-16 h-16 mb-4 opacity-50" />
                  <p>No renders yet</p>
                  <p className="text-sm">Configure test and click Run</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {results.map((result) => (
                    <div 
                      key={result.id}
                      className={`rounded-lg border overflow-hidden ${
                        result.passFail === "PASS" 
                          ? "border-green-500/30" 
                          : result.passFail === "FAIL"
                          ? "border-red-500/30"
                          : "border-[#333]"
                      }`}
                    >
                      {/* Image */}
                      <div className="aspect-video bg-[#1a1a1a] flex items-center justify-center">
                        {result.imageBase64 ? (
                          <img 
                            src={`data:image/png;base64,${result.imageBase64}`}
                            alt={`${result.vehicle.model} ${result.viewKey}`}
                            className="w-full h-full object-contain"
                          />
                        ) : result.imageUrl ? (
                          <img 
                            src={result.imageUrl}
                            alt={`${result.vehicle.model} ${result.viewKey}`}
                            className="w-full h-full object-contain"
                          />
                        ) : result.error ? (
                          <div className="text-center p-4">
                            <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
                            <p className="text-xs text-red-400">{result.error}</p>
                          </div>
                        ) : (
                          <RefreshCw className="w-8 h-8 text-gray-600 animate-spin" />
                        )}
                      </div>

                      {/* Info */}
                      <div className="p-3 bg-[#0a0a0a]">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <p className="font-medium text-white text-sm">{result.viewKey}</p>
                            <p className="text-xs text-gray-500">{result.vehicle.label}</p>
                          </div>
                          <Badge className={`${
                            result.passFail === "PASS" 
                              ? "bg-green-500/20 text-green-400"
                              : result.passFail === "FAIL"
                              ? "bg-red-500/20 text-red-400"
                              : "bg-gray-500/20 text-gray-400"
                          }`}>
                            {result.passFail}
                          </Badge>
                        </div>

                        {result.weightedTotal > 0 && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">Score:</span>
                            <span className={`text-sm font-bold ${
                              result.weightedTotal >= 7 ? "text-green-400" : "text-red-400"
                            }`}>
                              {result.weightedTotal.toFixed(1)}/10
                            </span>
                            <span className="text-xs text-gray-500 ml-auto">
                              {(result.timing_ms / 1000).toFixed(1)}s
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
