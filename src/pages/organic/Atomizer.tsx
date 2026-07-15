import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Atom, 
  FileText, 
  Upload, 
  DollarSign, 
  Sparkles, 
  ArrowLeft,
  Loader2,
  Package
} from "lucide-react";
import { useContentAtomizer } from "@/hooks/useContentAtomizer";
import { AtomList } from "@/components/atomizer/AtomList";
import { AtomGeneratorPanel } from "@/components/atomizer/AtomGeneratorPanel";
import { MicroContentOutput } from "@/components/atomizer/MicroContentOutput";
import { useOrganization } from "@/contexts/OrganizationContext";

const sourceTypes = [
  { value: "transcript", label: "Transcript / Video Script" },
  { value: "faq", label: "FAQs" },
  { value: "pricing", label: "Pricing / Product List" },
  { value: "website", label: "Website Copy" },
  { value: "pdf", label: "PDF / Document" },
  { value: "other", label: "Other Content" },
];

export default function Atomizer() {
  const navigate = useNavigate();
  const { organizationId } = useOrganization();
  
  const [textInput, setTextInput] = useState("");
  const [sourceType, setSourceType] = useState("other");
  
  const {
    atoms,
    loadingAtoms,
    products,
    selectedAtom,
    setSelectedAtom,
    generatedContent,
    atomizeContent,
    isAtomizing,
    generateMicroContent,
    isGenerating,
    deleteAtom,
    addToQueue,
  } = useContentAtomizer(organizationId);

  const handleAtomize = async () => {
    if (!textInput.trim()) return;
    try {
      await atomizeContent({ text: textInput, sourceType });
      // Only clear the input after a confirmed save — clearing on failure
      // silently destroyed the user's pasted content.
      setTextInput("");
    } catch {
      // Error toast already shown by the hook; keep the user's text.
    }
  };

  const handleGenerate = async (atom: any, format: string, style: string) => {
    await generateMicroContent({ atom, format, style });
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/organic")}
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gradient-to-r from-[#00AFFF] to-[#4EEAFF]">
                  <Atom className="w-5 h-5 text-white" />
                </div>
                <span className="bg-gradient-to-r from-[#00AFFF] to-[#4EEAFF] bg-clip-text text-transparent">
                  Content Atomizer
                </span>
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Upload transcripts, FAQs, pricing — AI breaks into micro-content
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1.5">
              <Package className="w-3 h-3" />
              {products.length} Products
            </Badge>
            <Badge variant="secondary" className="gap-1.5">
              <Atom className="w-3 h-3" />
              {atoms.length} Atoms
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Input & Atom List */}
          <div className="lg:col-span-2 space-y-6">
            {/* Input Section */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Upload className="w-4 h-4 text-primary" />
                  Upload Content
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="paste" className="w-full">
                  <TabsList className="grid w-full grid-cols-3 mb-4">
                    <TabsTrigger value="paste">
                      <FileText className="w-4 h-4 mr-1.5" />
                      Paste Text
                    </TabsTrigger>
                    <TabsTrigger value="upload" disabled>
                      <Upload className="w-4 h-4 mr-1.5" />
                      Upload File
                    </TabsTrigger>
                    <TabsTrigger value="pricing">
                      <DollarSign className="w-4 h-4 mr-1.5" />
                      Products
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="paste" className="space-y-4">
                    <div className="flex gap-3">
                      <Select value={sourceType} onValueChange={setSourceType}>
                        <SelectTrigger className="w-[200px]">
                          <SelectValue placeholder="Content Type" />
                        </SelectTrigger>
                        <SelectContent>
                          {sourceTypes.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <Textarea
                      placeholder="Paste your FAQs, transcripts, pricing info, or any content you want to atomize..."
                      className="min-h-[200px] resize-none"
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                    />

                    <Button
                      className="w-full bg-gradient-to-r from-[#00AFFF] to-[#4EEAFF] hover:opacity-90"
                      disabled={!textInput.trim() || isAtomizing}
                      onClick={handleAtomize}
                    >
                      {isAtomizing ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Atomizing...
                        </>
                      ) : (
                        <>
                          <Atom className="w-4 h-4 mr-2" />
                          Atomize Content
                        </>
                      )}
                    </Button>
                  </TabsContent>

                  <TabsContent value="upload">
                    <div className="border-2 border-dashed rounded-lg p-8 text-center">
                      <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        Drag & drop PDF, TXT, VTT, SRT, or CSV files
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Coming soon
                      </p>
                    </div>
                  </TabsContent>

                  <TabsContent value="pricing">
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        Loaded {products.length} products from your pricing database.
                        These will be used for product-aware content generation.
                      </p>
                      <ScrollArea className="h-[200px]">
                        <div className="space-y-2">
                          {products.map((product) => (
                            <div
                              key={product.id}
                              className="flex items-center justify-between p-2 rounded bg-muted/50"
                            >
                              <div>
                                <span className="text-sm font-medium">{product.product_name}</span>
                                {product.category && (
                                  <Badge variant="outline" className="ml-2 text-[10px]">
                                    {product.category}
                                  </Badge>
                                )}
                              </div>
                              <span className="text-sm text-muted-foreground">
                                ${product.price_per_sqft || product.flat_price || "—"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            {/* Atom List */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Atom className="w-4 h-4 text-primary" />
                    Content Atoms
                    <Badge variant="secondary" className="text-xs">
                      {atoms.length}
                    </Badge>
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px] pr-4">
                  <AtomList
                    atoms={atoms}
                    selectedAtom={selectedAtom}
                    onSelect={setSelectedAtom}
                    onDelete={deleteAtom}
                  />
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Generation Panel */}
          <div className="space-y-6">
            <AtomGeneratorPanel
              atom={selectedAtom}
              isGenerating={isGenerating}
              onGenerate={handleGenerate}
            />

            <MicroContentOutput
              content={generatedContent}
              onAddToQueue={addToQueue}
              onSendToReelBuilder={() => navigate("/organic/reel-builder")}
              onSendToAdCreator={() => navigate("/contentbox")}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
