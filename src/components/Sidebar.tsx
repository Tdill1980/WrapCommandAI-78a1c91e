import { NavLink } from "@/components/NavLink";
import {
  LayoutDashboard,
  Sparkles,
  FolderOpen,
  Package,
  Calendar,
  CalendarDays,
  ShoppingCart,
  Users,
  CheckCircle,
  Briefcase,
  Award,
  DollarSign,
  Settings,
  Mail,
  Car,
  Activity,
  Power,
  Dna,
  FileText,
  Palette,
  Film,
  AlertTriangle,
  Clock,
  Zap,
  Heart,
} from "lucide-react";
import logo from "@/assets/wrapcommand-logo-new.png";
import { useUserRole, OrganizationRole } from "@/hooks/useUserRole";

interface NavigationItem {
  name: string;
  path: string;
  icon: any;
  customRender?: React.ReactNode;
  roles?: OrganizationRole[];
}

interface NavigationSection {
  title: string;
  items: NavigationItem[];
}

// CORE: Essential daily operations
const coreItems: NavigationItem[] = [
  { name: "Dashboard", path: "/dashboard", icon: LayoutDashboard, roles: ["beta_shop", "affiliate", "admin"] },
  { name: "ApproveFlow", path: "/approveflow", icon: CheckCircle, roles: ["beta_shop", "admin"] },
  { 
    name: "MyShopFlow", 
    path: "/my-shopflow", 
    icon: ShoppingCart,
    roles: ["beta_shop", "admin"],
    customRender: (
      <span className="font-['Poppins',sans-serif] font-semibold">
        <span className="text-white">My</span>
        <span className="bg-gradient-to-r from-[#00AFFF] to-[#0047FF] bg-clip-text text-transparent">ShopFlow</span>
        <span className="text-[8px] align-super text-muted-foreground">™</span>
      </span>
    )
  },
  { 
    name: "ShopFlow Bulk", 
    path: "/shopflow-bulk-admin", 
    icon: Package,
    roles: ["beta_shop", "admin"],
    customRender: (
      <span className="font-medium">
        <span className="text-white">ShopFlow </span>
        <span className="text-gradient">Bulk</span>
      </span>
    )
  },
  { name: "MightyCustomer", path: "/mighty-customer", icon: Users, roles: ["beta_shop", "admin"] },
  { name: "CommandContacts", path: "/command-contacts", icon: Users, roles: ["beta_shop", "admin"] },
  { 
    name: "MightyPortfolio", 
    path: "/portfolio", 
    icon: Briefcase, 
    roles: ["beta_shop", "admin"],
    customRender: (
      <span className="font-['Poppins',sans-serif] font-semibold">
        <span className="text-white">Mighty</span>
        <span className="bg-gradient-to-r from-[#00AFFF] to-[#0047FF] bg-clip-text text-transparent">Portfolio</span>
        <span className="text-[8px] align-super text-muted-foreground">™</span>
      </span>
    )
  },
];

// STUDIO: Content creation workspace
const studioItems: NavigationItem[] = [
  { 
    name: "Reel Builder", 
    path: "/organic/reel-builder", 
    icon: Film,
    roles: ["beta_shop", "admin"],
    customRender: (
      <span className="font-['Poppins',sans-serif] font-semibold">
        <span className="text-white">Reel </span>
        <span className="bg-gradient-to-r from-[#FF6B6B] to-[#FF8E53] bg-clip-text text-transparent">Builder</span>
        <span className="text-[8px] align-super text-muted-foreground ml-1">⭐</span>
      </span>
    )
  },
  { 
    name: "Content Studio", 
    path: "/studio", 
    icon: Palette,
    roles: ["beta_shop", "admin"],
    customRender: (
      <span className="font-['Poppins',sans-serif] font-semibold">
        <span className="text-white">Content </span>
        <span className="bg-gradient-to-r from-[#00AFFF] to-[#0047FF] bg-clip-text text-transparent">Studio</span>
      </span>
    )
  },
  { 
    name: "Content Calendar", 
    path: "/content-calendar", 
    icon: CalendarDays,
    roles: ["beta_shop", "admin"],
    customRender: (
      <span className="font-medium">
        <span className="text-white">Content </span>
        <span className="bg-gradient-to-r from-[#405DE6] via-[#833AB4] to-[#E1306C] bg-clip-text text-transparent">Calendar</span>
      </span>
    )
  },
  { 
    name: "Content Drafts", 
    path: "/content-drafts", 
    icon: FileText,
    roles: ["beta_shop", "admin"],
  },
  { 
    name: "Media Library", 
    path: "/contentbox", 
    icon: FolderOpen,
    roles: ["beta_shop", "admin"],
  },
];

// OPERATIONS: Backend management
const operationsItems: NavigationItem[] = [
  { 
    name: "Website Chat", 
    path: "/website-admin", 
    icon: Activity,
    roles: ["admin", "beta_shop"],
    customRender: (
      <span className="font-['Poppins',sans-serif] font-semibold">
        <span className="text-white">Website </span>
        <span className="bg-gradient-to-r from-[#00AFFF] to-[#0047FF] bg-clip-text text-transparent">Chat</span>
      </span>
    )
  },
  {
    name: "Wrap Guru",
    path: "/admin/chat-widget-demo",
    icon: Sparkles,
    roles: ["admin", "beta_shop"],
    customRender: (
      <span className="font-['Poppins',sans-serif] font-semibold">
        <span className="text-white">Wrap </span>
        <span className="bg-gradient-to-r from-[#e6007e] to-[#7c3aed] bg-clip-text text-transparent">Guru</span>
      </span>
    )
  },
  {
    name: "Escalation Desk",
    path: "/escalations",
    icon: AlertTriangle,
    roles: ["admin", "beta_shop"],
    customRender: (
      <span className="font-['Poppins',sans-serif] font-semibold">
        <span className="text-white">Escalation </span>
        <span className="bg-gradient-to-r from-[#F59E0B] to-[#EF4444] bg-clip-text text-transparent">Desk</span>
      </span>
    )
  },
  {
    name: "Command Ops",
    path: "/command-ops",
    icon: Activity,
    roles: ["admin", "beta_shop"],
    customRender: (
      <span className="font-['Poppins',sans-serif] font-semibold">
        <span className="text-white">Command </span>
        <span className="bg-gradient-to-r from-[#10B981] to-[#14B8A6] bg-clip-text text-transparent">Ops</span>
      </span>
    )
  },
  {
    name: "Website Quotes Manager",
    path: "/website-quote-management",
    icon: Users,
    roles: ["admin", "beta_shop"],
    customRender: (
      <span className="font-['Poppins',sans-serif] font-semibold">
        <span className="text-white">Website </span>
        <span className="bg-gradient-to-r from-[#10B981] to-[#059669] bg-clip-text text-transparent">Quotes</span>
        <span className="text-white"> Manager</span>
      </span>
    )
},
{ 
  name: "Quote Tool", 
  path: "/quote-admin", 
  icon: DollarSign,
  roles: ["admin", "beta_shop"],
  customRender: (
    <span className="font-['Poppins',sans-serif] font-semibold">
      <span className="text-white">Quote </span>
      <span className="bg-gradient-to-r from-[#10B981] to-[#059669] bg-clip-text text-transparent">Tool</span>
      <span className="text-[8px] align-super ml-1 text-green-400">$21K</span>
    </span>
  )
  },
  { 
    name: "ShopFlow Internal", 
    path: "/shopflow-internal", 
    icon: Package,
    roles: ["beta_shop", "admin"],
    customRender: (
      <span className="font-medium">
        <span className="text-white">ShopFlow </span>
        <span className="text-gradient">Internal</span>
      </span>
    )
  },
  { 
    name: "MightyMail", 
    path: "/admin/mightymail", 
    icon: Mail,
    roles: ["beta_shop", "admin"],
    customRender: (
      <span className="font-['Poppins',sans-serif] font-semibold">
        <span className="text-white">Mighty</span>
        <span className="bg-gradient-to-r from-[#00AFFF] to-[#0047FF] bg-clip-text text-transparent">Mail</span>
        <span className="text-[8px] align-super text-muted-foreground">™</span>
      </span>
    )
  },
  { 
    name: "Team Availability", 
    path: "/admin/availability", 
    icon: Clock,
    roles: ["admin", "beta_shop"],
    customRender: (
      <span className="font-['Poppins',sans-serif] font-semibold">
        <span className="text-white">Team </span>
        <span className="bg-gradient-to-r from-[#8B5CF6] to-[#A855F7] bg-clip-text text-transparent">Availability</span>
      </span>
    )
  },
];

// TOOLS: Design and content creation
const toolsItems: NavigationItem[] = [
  { name: "DesignVault", path: "/designvault", icon: FolderOpen, roles: ["beta_shop", "admin"] },
  {
    name: "DesignPanelPro™",
    path: "/designpanel",
    icon: Sparkles,
    roles: ["beta_shop", "admin"],
    customRender: (
      <span className="font-medium">
        <span className="text-white">Design</span>
        <span className="text-gradient">Panel</span>
        <span className="text-white">Pro</span>
        <span className="text-[8px] align-super text-muted-foreground">™</span>
      </span>
    )
  },
  { name: "Monthly Drops", path: "/monthly-drops", icon: Calendar, roles: ["beta_shop", "admin"] },
];

// ONBOARDING: Setup and configuration
const onboardingItems: NavigationItem[] = [
  {
    name: "TradeDNA Wizard",
    path: "/tradedna",
    icon: Dna,
    roles: ["beta_shop", "admin"],
    customRender: (
      <span className="font-medium">
        <span className="text-white">Trade</span>
        <span className="text-gradient">DNA</span>
        <span className="text-white"> Wizard</span>
      </span>
    )
  },
];

// AFFILIATE: Affiliate program management
const affiliateItems: NavigationItem[] = [
  { 
    name: "Affiliate Dashboard", 
    path: "/affiliate/dashboard", 
    icon: Award,
    roles: ["affiliate", "admin"],
    customRender: (
      <span className="font-['Poppins',sans-serif] font-semibold">
        <span className="text-white">Affiliate </span>
        <span className="bg-gradient-to-r from-[#00AFFF] to-[#0047FF] bg-clip-text text-transparent">Dashboard</span>
      </span>
    )
  },
  { 
    name: "MightyAffiliate", 
    path: "/affiliate/admin", 
    icon: Award,
    customRender: (
      <span className="font-['Poppins',sans-serif] font-semibold">
        <span className="text-white">Mighty</span>
        <span className="bg-gradient-to-r from-[#00AFFF] to-[#0047FF] bg-clip-text text-transparent">Affiliate</span>
      </span>
    )
  },
];

// ACCOUNT: Settings and products
const accountItems: NavigationItem[] = [
  { name: "My Products", path: "/settings/products", icon: DollarSign, roles: ["beta_shop", "admin"] },
  { name: "Account Settings", path: "/settings/instagram", icon: Settings, roles: ["beta_shop", "affiliate", "admin"] },
];

// ADMIN ONLY: Internal tools
const adminItems: NavigationItem[] = [
  { name: "Vehicle Admin", path: "/admin/vehicles", icon: Car },
  { name: "Organizations", path: "/admin/organizations", icon: Users },
  { 
    name: "Ops", 
    path: "/ops", 
    icon: Zap,
    customRender: (
      <span className="font-['Poppins',sans-serif] font-semibold">
        <span className="bg-gradient-to-r from-[#F59E0B] to-[#EF4444] bg-clip-text text-transparent">Ops</span>
      </span>
    )
  },
  { 
    name: "Jordan Control", 
    path: "/admin/website-agent", 
    icon: Power,
    customRender: (
      <span className="font-['Poppins',sans-serif] font-semibold">
        <span className="text-white">Jordan </span>
        <span className="bg-gradient-to-r from-[#00AFFF] to-[#0047FF] bg-clip-text text-transparent">Control</span>
      </span>
    )
  },
];

const sections: NavigationSection[] = [
  { title: "Core", items: coreItems },
  { title: "Studio", items: studioItems },
  { title: "Operations", items: operationsItems },
  { title: "Tools", items: toolsItems },
  { title: "Onboarding", items: onboardingItems },
  { title: "Affiliate", items: affiliateItems },
  { title: "Account", items: accountItems },
  { title: "Admin", items: adminItems },
];

export const Sidebar = ({ onMobileClose }: { onMobileClose?: () => void }) => {
  const { role, isLoading } = useUserRole();

  const effectiveRole = isLoading ? "beta_shop" : role;

  // Filter items based on role
  const filterItems = (items: NavigationItem[]) => {
    return items.filter((item) => {
      if (!item.roles) {
        return effectiveRole === "admin";
      }
      return item.roles.includes(effectiveRole);
    });
  };

  return (
    <aside className="flex flex-col w-full h-full bg-sidebar border-r border-sidebar-border">
      <div className="px-4 py-6 border-b border-sidebar-border">
        <img
          src={logo}
          alt="WrapCommand AI"
          className="w-full h-28 object-contain"
        />
      </div>
      
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-4 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        {sections.map((section) => {
          const filteredItems = filterItems(section.items);
          
          // Don't render empty sections
          if (filteredItems.length === 0) return null;
          
          // Hide Admin section from non-admins
          if (section.title === "Admin" && effectiveRole !== "admin") return null;
          
          return (
            <div key={section.title}>
              <p className="px-3 mb-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                {section.title}
              </p>
              <div className="space-y-0.5">
                {filteredItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={() => onMobileClose?.()}
                      className="flex items-center gap-3 px-3 py-2 text-sm text-sidebar-foreground hover:text-foreground hover:bg-white/5 transition-all rounded-lg relative"
                      activeClassName="text-foreground bg-white/5 before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-gradient-primary before:rounded-r"
                    >
                      <Icon className="w-4 h-4" strokeWidth={1.5} />
                      {item.customRender || <span className="font-medium">{item.name}</span>}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="p-3 border-t border-sidebar-border">
        <div className="px-3 py-2 rounded-xl bg-white/[0.02] border border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-foreground">
                {role === "admin" ? "Admin" : role === "affiliate" ? "Affiliate" : "Pro Plan"}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Active</p>
            </div>
            <div className="w-2 h-2 rounded-full bg-primary shadow-glow"></div>
          </div>
        </div>
      </div>
    </aside>
  );
};
