import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { 
  MessageCircle, 
  Mail, 
  Palette, 
  Instagram, 
  Users, 
  Heart, 
  Megaphone, 
  Camera,
  BookOpen,
  Globe
} from "lucide-react";

export interface AgentOption {
  id: string;
  name: string;
  role: string;
  inbox: string; // Which inbox/channel this agent handles
  icon: React.ElementType;
  color: string;
}

export const AVAILABLE_AGENTS: AgentOption[] = [
  {
    id: "jordan_lee",
    name: "Jordan Lee",
    role: "Website & Sales",
    inbox: "Website Chat Widget",
    icon: Globe,
    color: "text-blue-500 bg-blue-500/10 hover:bg-blue-500/20",
  },
  {
    id: "alex_morgan",
    name: "Alex Morgan",
    role: "Quotes & Pricing",
    inbox: "hello@weprintwraps.com",
    icon: Mail,
    color: "text-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20",
  },
  {
    id: "grant_miller",
    name: "Grant Miller",
    role: "Design & Files",
    inbox: "design@weprintwraps.com",
    icon: Palette,
    color: "text-purple-500 bg-purple-500/10 hover:bg-purple-500/20",
  },
  {
    id: "casey_ramirez",
    name: "Casey Ramirez",
    role: "Affiliate Manager",
    inbox: "MightyAffiliate • Sponsored Artists",
    icon: Heart,
    color: "text-pink-500 bg-pink-500/10 hover:bg-pink-500/20",
  },
  {
    id: "taylor_brooks",
    name: "Taylor Brooks",
    role: "Partnerships & Sales",
    inbox: "Field Ops • Invoked by Ops Desk",
    icon: Users,
    color: "text-amber-500 bg-amber-500/10 hover:bg-amber-500/20",
  },
  {
    id: "evan_porter",
    name: "Evan Porter",
    role: "Affiliates",
    inbox: "Affiliate Portal • Invoked by Ops Desk",
    icon: Heart,
    color: "text-red-500 bg-red-500/10 hover:bg-red-500/20",
  },
  {
    id: "emily_carter",
    name: "Emily Carter",
    role: "Marketing Content",
    inbox: "ContentBox • Email Campaigns",
    icon: Megaphone,
    color: "text-cyan-500 bg-cyan-500/10 hover:bg-cyan-500/20",
  },
  {
    id: "noah_bennett",
    name: "Noah Bennett",
    role: "Social Content",
    inbox: "ContentBox • Reels & Stories",
    icon: Camera,
    color: "text-orange-500 bg-orange-500/10 hover:bg-orange-500/20",
  },
  {
    id: "ryan_mitchell",
    name: "Ryan Mitchell",
    role: "Editorial (Ink & Edge)",
    inbox: "Ink & Edge Magazine",
    icon: BookOpen,
    color: "text-indigo-500 bg-indigo-500/10 hover:bg-indigo-500/20",
  },
  {
    id: "wraptvworld_producer",
    name: "WrapTVWorld Producer",
    role: "Video Production",
    inbox: "WrapTVWorld • YouTube Episodes",
    icon: Camera,
    color: "text-teal-500 bg-teal-500/10 hover:bg-teal-500/20",
  },
  {
    id: "harper_quinn",
    name: "Harper Quinn",
    role: "Inbox & Email Concierge",
    inbox: "All inboxes • Drafts & answers email",
    icon: Mail,
    color: "text-sky-500 bg-sky-500/10 hover:bg-sky-500/20",
  },
  {
    id: "dana_cole",
    name: "Dana Cole",
    role: "Enterprise Accounts & Outreach",
    inbox: "Enterprise pipeline • Outbound",
    icon: Megaphone,
    color: "text-violet-500 bg-violet-500/10 hover:bg-violet-500/20",
  },
];

interface AgentSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectAgent: (agentId: string) => void;
}

export function AgentSelector({ open, onOpenChange, onSelectAgent }: AgentSelectorProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-xl">🧠</span>
            Talk to Agent
          </DialogTitle>
        </DialogHeader>
        
        <div className="grid gap-2 py-4 max-h-[60vh] overflow-y-auto">
          {AVAILABLE_AGENTS.map((agent) => (
            <Button
              key={agent.id}
              variant="ghost"
              className={cn(
                "w-full justify-start h-auto py-3 px-4",
                agent.color
              )}
              onClick={() => {
                onSelectAgent(agent.id);
                onOpenChange(false);
              }}
            >
              <agent.icon className="w-5 h-5 mr-3 flex-shrink-0" />
              <div className="text-left flex-1">
                <div className="font-medium">{agent.name}</div>
                <div className="text-xs text-muted-foreground">{agent.role}</div>
                <div className="text-[10px] text-muted-foreground/70 mt-0.5 flex items-center gap-1">
                  <Mail className="w-3 h-3" />
                  {agent.inbox}
                </div>
              </div>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
