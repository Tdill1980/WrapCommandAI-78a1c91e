import { useState, useEffect } from "react";
import { MainLayout } from "@/layouts/MainLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import {
  Activity,
  Mail,
  FileText,
  Tag,
  CheckCircle,
  Circle,
  AlertTriangle,
  RefreshCw,
  Search,
  Code,
  DollarSign,
  Headphones,
  Megaphone,
  Bot,
  Clock,
  Calendar,
  BookOpen,
  ListTodo,
  ArrowRight,
} from "lucide-react";

interface WrenActivity {
  id: string;
  action_type: string;
  description: string;
  metadata: Record<string, any>;
  created_at: string;
  status: string;
}

interface WrenTask {
  id: string;
  category: 'dev' | 'sales' | 'csr' | 'marketing';
  title: string;
  description: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_date: string | null;
  follow_up_date: string | null;
  created_at: string;
  completed_at: string | null;
}

interface DiaryEntry {
  id: string;
  entry_date: string;
  synopsis: string;
  dev_summary: string | null;
  sales_summary: string | null;
  csr_summary: string | null;
  marketing_summary: string | null;
  tasks_completed: number;
  emails_sent: number;
  quotes_created: number;
  highlights: string[];
  issues: string[];
  tomorrow_priorities: string[];
}

export default function CommandOpsPage() {
  const [activities, setActivities] = useState<WrenActivity[]>([]);
  const [tasks, setTasks] = useState<WrenTask[]>([]);
  const [diaryEntries, setDiaryEntries] = useState<DiaryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('todo');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    await Promise.all([fetchActivities(), fetchTasks(), fetchDiary()]);
    setLoading(false);
  };

  const fetchActivities = async () => {
    try {
      const { data } = await supabase
        .from('wren_activity_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      setActivities(data || []);
    } catch (err) {
      console.error('Error fetching activities:', err);
    }
  };

  const fetchTasks = async () => {
    try {
      const { data } = await supabase
        .from('wren_tasks')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      setTasks((data as WrenTask[]) || []);
    } catch (err) {
      console.error('Error fetching tasks:', err);
    }
  };

  const fetchDiary = async () => {
    try {
      const { data } = await supabase
        .from('wren_diary')
        .select('*')
        .order('entry_date', { ascending: false })
        .limit(30);
      setDiaryEntries((data as DiaryEntry[]) || []);
    } catch (err) {
      console.error('Error fetching diary:', err);
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'dev': return <Code className="w-4 h-4" />;
      case 'sales': return <DollarSign className="w-4 h-4" />;
      case 'csr': return <Headphones className="w-4 h-4" />;
      case 'marketing': return <Megaphone className="w-4 h-4" />;
      default: return <Activity className="w-4 h-4" />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'dev': return { bg: 'bg-purple-500', light: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500' };
      case 'sales': return { bg: 'bg-green-500', light: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500' };
      case 'csr': return { bg: 'bg-blue-500', light: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500' };
      case 'marketing': return { bg: 'bg-orange-500', light: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500' };
      default: return { bg: 'bg-gray-500', light: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500' };
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'urgent': return <Badge className="bg-red-500 text-white text-xs">URGENT</Badge>;
      case 'high': return <Badge className="bg-orange-500/20 text-orange-400 text-xs">HIGH</Badge>;
      case 'medium': return <Badge className="bg-yellow-500/20 text-yellow-400 text-xs">MED</Badge>;
      default: return <Badge className="bg-gray-500/20 text-gray-400 text-xs">LOW</Badge>;
    }
  };

  // Pending tasks (TO DO)
  const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress');
  const completedTasks = tasks.filter(t => t.status === 'completed');

  // Group pending by category
  const todoByCategory = {
    dev: pendingTasks.filter(t => t.category === 'dev'),
    sales: pendingTasks.filter(t => t.category === 'sales'),
    csr: pendingTasks.filter(t => t.category === 'csr'),
    marketing: pendingTasks.filter(t => t.category === 'marketing'),
  };

  // Activity stats
  const todayActivities = activities.filter(a => {
    const today = new Date().toISOString().split('T')[0];
    return a.created_at.startsWith(today);
  });

  return (
    <MainLayout>
      <div className="p-6 bg-gray-900 min-h-screen">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-pink-500 via-purple-500 to-blue-500 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/30">
              <Bot className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-400 via-purple-400 to-blue-400 bg-clip-text text-transparent">Command Ops</h1>
              <p className="text-gray-400">Wren's Task Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right mr-4">
              <div className="text-2xl font-bold text-white">{pendingTasks.length}</div>
              <div className="text-sm text-gray-400">Tasks To Do</div>
            </div>
            <Button onClick={fetchAll} variant="outline" className="border-gray-600 hover:bg-gray-800">
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Quick Stats Row */}
        <div className="grid grid-cols-5 gap-3 mb-6">
          <Card className="p-3 bg-gradient-to-br from-purple-900/50 to-purple-800/30 border-purple-500/30">
            <div className="flex items-center justify-between">
              <Code className="w-5 h-5 text-purple-400" />
              <span className="text-2xl font-bold text-white">{todoByCategory.dev.length}</span>
            </div>
            <div className="text-xs text-purple-300 mt-1">DEV Tasks</div>
          </Card>
          <Card className="p-3 bg-gradient-to-br from-green-900/50 to-green-800/30 border-green-500/30">
            <div className="flex items-center justify-between">
              <DollarSign className="w-5 h-5 text-green-400" />
              <span className="text-2xl font-bold text-white">{todoByCategory.sales.length}</span>
            </div>
            <div className="text-xs text-green-300 mt-1">SALES Tasks</div>
          </Card>
          <Card className="p-3 bg-gradient-to-br from-blue-900/50 to-blue-800/30 border-blue-500/30">
            <div className="flex items-center justify-between">
              <Headphones className="w-5 h-5 text-blue-400" />
              <span className="text-2xl font-bold text-white">{todoByCategory.csr.length}</span>
            </div>
            <div className="text-xs text-blue-300 mt-1">CSR Tasks</div>
          </Card>
          <Card className="p-3 bg-gradient-to-br from-orange-900/50 to-orange-800/30 border-orange-500/30">
            <div className="flex items-center justify-between">
              <Megaphone className="w-5 h-5 text-orange-400" />
              <span className="text-2xl font-bold text-white">{todoByCategory.marketing.length}</span>
            </div>
            <div className="text-xs text-orange-300 mt-1">MARKETING Tasks</div>
          </Card>
          <Card className="p-3 bg-gradient-to-br from-teal-900/50 to-teal-800/30 border-teal-500/30">
            <div className="flex items-center justify-between">
              <CheckCircle className="w-5 h-5 text-teal-400" />
              <span className="text-2xl font-bold text-white">{completedTasks.length}</span>
            </div>
            <div className="text-xs text-teal-300 mt-1">Completed</div>
          </Card>
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-gray-800/50 border border-purple-500/30 p-1">
            <TabsTrigger value="todo" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-pink-600 data-[state=active]:to-purple-600 data-[state=active]:text-white px-6">
              <ListTodo className="w-4 h-4 mr-2" />
              TO DO ({pendingTasks.length})
            </TabsTrigger>
            <TabsTrigger value="activity" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-600 data-[state=active]:to-blue-600 data-[state=active]:text-white px-6">
              <Activity className="w-4 h-4 mr-2" />
              Activity ({todayActivities.length} today)
            </TabsTrigger>
            <TabsTrigger value="completed" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-cyan-600 data-[state=active]:text-white px-6">
              <CheckCircle className="w-4 h-4 mr-2" />
              Completed ({completedTasks.length})
            </TabsTrigger>
            <TabsTrigger value="diary" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-pink-600 data-[state=active]:via-purple-600 data-[state=active]:to-blue-600 data-[state=active]:text-white px-6">
              <BookOpen className="w-4 h-4 mr-2" />
              Diary
            </TabsTrigger>
            <TabsTrigger value="devstatus" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-600 data-[state=active]:to-teal-600 data-[state=active]:text-white px-6">
              <Bot className="w-4 h-4 mr-2" />
              Dev Status
            </TabsTrigger>
          </TabsList>

          {/* TO DO Tab */}
          <TabsContent value="todo" className="space-y-6">
            {/* Urgent Tasks First */}
            {pendingTasks.filter(t => t.priority === 'urgent').length > 0 && (
              <Card className="bg-red-900/20 border-red-500/50 p-4">
                <h3 className="text-lg font-bold text-red-400 mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" /> URGENT
                </h3>
                <div className="space-y-2">
                  {pendingTasks.filter(t => t.priority === 'urgent').map(task => (
                    <div key={task.id} className="flex items-center gap-3 p-3 bg-red-900/30 rounded-lg">
                      <Circle className="w-5 h-5 text-red-400" />
                      <div className="flex-1">
                        <div className="text-white font-medium">{task.title}</div>
                        {task.description && <div className="text-red-300 text-sm">{task.description}</div>}
                      </div>
                      <Badge className={`${getCategoryColor(task.category).light} ${getCategoryColor(task.category).text}`}>
                        {task.category.toUpperCase()}
                      </Badge>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Tasks by Category */}
            <div className="grid grid-cols-2 gap-4">
              {/* DEV */}
              <Card className="bg-gray-800/50 border-purple-500/30 p-4">
                <h3 className="text-lg font-bold text-purple-400 mb-3 flex items-center gap-2">
                  <Code className="w-5 h-5" /> DEV ({todoByCategory.dev.length})
                </h3>
                <div className="space-y-2">
                  {todoByCategory.dev.length === 0 ? (
                    <div className="text-gray-500 text-sm py-4 text-center">No pending DEV tasks</div>
                  ) : (
                    todoByCategory.dev.map(task => (
                      <div key={task.id} className="flex items-start gap-3 p-3 bg-gray-800 rounded-lg hover:bg-gray-750 transition-colors">
                        <Circle className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-white text-sm font-medium">{task.title}</div>
                          {task.due_date && (
                            <div className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                              <Clock className="w-3 h-3" /> Due: {format(new Date(task.due_date), 'MMM d')}
                            </div>
                          )}
                        </div>
                        {getPriorityBadge(task.priority)}
                      </div>
                    ))
                  )}
                </div>
              </Card>

              {/* SALES */}
              <Card className="bg-gray-800/50 border-green-500/30 p-4">
                <h3 className="text-lg font-bold text-green-400 mb-3 flex items-center gap-2">
                  <DollarSign className="w-5 h-5" /> SALES ({todoByCategory.sales.length})
                </h3>
                <div className="space-y-2">
                  {todoByCategory.sales.length === 0 ? (
                    <div className="text-gray-500 text-sm py-4 text-center">No pending SALES tasks</div>
                  ) : (
                    todoByCategory.sales.map(task => (
                      <div key={task.id} className="flex items-start gap-3 p-3 bg-gray-800 rounded-lg hover:bg-gray-750 transition-colors">
                        <Circle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-white text-sm font-medium">{task.title}</div>
                          {task.due_date && (
                            <div className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                              <Clock className="w-3 h-3" /> Due: {format(new Date(task.due_date), 'MMM d')}
                            </div>
                          )}
                        </div>
                        {getPriorityBadge(task.priority)}
                      </div>
                    ))
                  )}
                </div>
              </Card>

              {/* CSR */}
              <Card className="bg-gray-800/50 border-blue-500/30 p-4">
                <h3 className="text-lg font-bold text-blue-400 mb-3 flex items-center gap-2">
                  <Headphones className="w-5 h-5" /> CSR ({todoByCategory.csr.length})
                </h3>
                <div className="space-y-2">
                  {todoByCategory.csr.length === 0 ? (
                    <div className="text-gray-500 text-sm py-4 text-center">No pending CSR tasks</div>
                  ) : (
                    todoByCategory.csr.map(task => (
                      <div key={task.id} className="flex items-start gap-3 p-3 bg-gray-800 rounded-lg hover:bg-gray-750 transition-colors">
                        <Circle className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-white text-sm font-medium">{task.title}</div>
                          {task.due_date && (
                            <div className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                              <Clock className="w-3 h-3" /> Due: {format(new Date(task.due_date), 'MMM d')}
                            </div>
                          )}
                        </div>
                        {getPriorityBadge(task.priority)}
                      </div>
                    ))
                  )}
                </div>
              </Card>

              {/* MARKETING */}
              <Card className="bg-gray-800/50 border-orange-500/30 p-4">
                <h3 className="text-lg font-bold text-orange-400 mb-3 flex items-center gap-2">
                  <Megaphone className="w-5 h-5" /> MARKETING ({todoByCategory.marketing.length})
                </h3>
                <div className="space-y-2">
                  {todoByCategory.marketing.length === 0 ? (
                    <div className="text-gray-500 text-sm py-4 text-center">No pending MARKETING tasks</div>
                  ) : (
                    todoByCategory.marketing.map(task => (
                      <div key={task.id} className="flex items-start gap-3 p-3 bg-gray-800 rounded-lg hover:bg-gray-750 transition-colors">
                        <Circle className="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-white text-sm font-medium">{task.title}</div>
                          {task.due_date && (
                            <div className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                              <Clock className="w-3 h-3" /> Due: {format(new Date(task.due_date), 'MMM d')}
                            </div>
                          )}
                        </div>
                        {getPriorityBadge(task.priority)}
                      </div>
                    ))
                  )}
                </div>
              </Card>
            </div>
          </TabsContent>

          {/* Activity Tab */}
          <TabsContent value="activity">
            <Card className="bg-gray-800/50 border-gray-700">
              <div className="p-4 border-b border-gray-700">
                <h2 className="text-lg font-semibold text-white">Activity Log</h2>
              </div>
              <div className="divide-y divide-gray-700/50 max-h-[600px] overflow-y-auto">
                {activities.length === 0 ? (
                  <div className="p-8 text-center text-gray-400">No activities yet</div>
                ) : (
                  activities.map((activity) => (
                    <div key={activity.id} className="p-4 hover:bg-gray-700/30">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-gray-700 rounded-lg">
                          {activity.action_type === 'email_sent' && <Mail className="w-4 h-4 text-blue-400" />}
                          {activity.action_type === 'quote_created' && <FileText className="w-4 h-4 text-green-400" />}
                          {activity.action_type === 'coupon_created' && <Tag className="w-4 h-4 text-purple-400" />}
                          {activity.action_type === 'task_completed' && <CheckCircle className="w-4 h-4 text-teal-400" />}
                          {activity.action_type === 'function_deployed' && <Bot className="w-4 h-4 text-orange-400" />}
                        </div>
                        <div className="flex-1">
                          <p className="text-white text-sm">{activity.description}</p>
                          <div className="text-xs text-gray-500 mt-1">
                            {format(new Date(activity.created_at), 'MMM d, yyyy h:mm a')}
                          </div>
                        </div>
                        <Badge variant="outline" className="text-xs">{activity.action_type.replace('_', ' ')}</Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </TabsContent>

          {/* Completed Tab */}
          <TabsContent value="completed">
            <Card className="bg-gray-800/50 border-gray-700">
              <div className="p-4 border-b border-gray-700">
                <h2 className="text-lg font-semibold text-white">Completed Tasks</h2>
              </div>
              <div className="divide-y divide-gray-700/50 max-h-[600px] overflow-y-auto">
                {completedTasks.length === 0 ? (
                  <div className="p-8 text-center text-gray-400">No completed tasks yet</div>
                ) : (
                  completedTasks.map((task) => {
                    const colors = getCategoryColor(task.category);
                    return (
                      <div key={task.id} className="p-4 hover:bg-gray-700/30">
                        <div className="flex items-start gap-3">
                          <CheckCircle className={`w-5 h-5 ${colors.text}`} />
                          <div className="flex-1">
                            <div className="text-white text-sm font-medium line-through opacity-70">{task.title}</div>
                            {task.completed_at && (
                              <div className="text-xs text-gray-500 mt-1">
                                Completed: {format(new Date(task.completed_at), 'MMM d, h:mm a')}
                              </div>
                            )}
                          </div>
                          <Badge className={`${colors.light} ${colors.text}`}>{task.category.toUpperCase()}</Badge>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>
          </TabsContent>

          {/* Diary Tab */}
          <TabsContent value="diary">
            <Card className="bg-gray-800/50 border-gray-700">
              <div className="p-4 border-b border-gray-700">
                <h2 className="text-lg font-semibold text-white">Wren's Diary</h2>
                <p className="text-sm text-gray-400">Nightly synopsis at 11pm AZ time</p>
              </div>
              <div className="divide-y divide-gray-700">
                {diaryEntries.length === 0 ? (
                  <div className="p-8 text-center text-gray-400">No diary entries yet</div>
                ) : (
                  diaryEntries.map((entry) => (
                    <div key={entry.id} className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-bold text-white">
                          {format(new Date(entry.entry_date), 'EEEE, MMMM d, yyyy')}
                        </h3>
                        <div className="flex gap-2">
                          <Badge className="bg-blue-500/20 text-blue-400">{entry.emails_sent} emails</Badge>
                          <Badge className="bg-green-500/20 text-green-400">{entry.quotes_created} quotes</Badge>
                          <Badge className="bg-teal-500/20 text-teal-400">{entry.tasks_completed} tasks</Badge>
                        </div>
                      </div>
                      <p className="text-gray-300 mb-4 text-lg">{entry.synopsis}</p>
                      
                      <div className="grid grid-cols-2 gap-4">
                        {entry.dev_summary && (
                          <div className="bg-purple-500/10 p-4 rounded-lg border border-purple-500/30">
                            <div className="flex items-center gap-2 text-purple-400 font-semibold mb-2">
                              <Code className="w-4 h-4" /> DEV
                            </div>
                            <p className="text-gray-300 text-sm">{entry.dev_summary}</p>
                          </div>
                        )}
                        {entry.sales_summary && (
                          <div className="bg-green-500/10 p-4 rounded-lg border border-green-500/30">
                            <div className="flex items-center gap-2 text-green-400 font-semibold mb-2">
                              <DollarSign className="w-4 h-4" /> SALES
                            </div>
                            <p className="text-gray-300 text-sm">{entry.sales_summary}</p>
                          </div>
                        )}
                        {entry.csr_summary && (
                          <div className="bg-blue-500/10 p-4 rounded-lg border border-blue-500/30">
                            <div className="flex items-center gap-2 text-blue-400 font-semibold mb-2">
                              <Headphones className="w-4 h-4" /> CSR
                            </div>
                            <p className="text-gray-300 text-sm">{entry.csr_summary}</p>
                          </div>
                        )}
                        {entry.marketing_summary && (
                          <div className="bg-orange-500/10 p-4 rounded-lg border border-orange-500/30">
                            <div className="flex items-center gap-2 text-orange-400 font-semibold mb-2">
                              <Megaphone className="w-4 h-4" /> MARKETING
                            </div>
                            <p className="text-gray-300 text-sm">{entry.marketing_summary}</p>
                          </div>
                        )}
                      </div>

                      {entry.tomorrow_priorities && entry.tomorrow_priorities.length > 0 && (
                        <div className="mt-4 bg-gray-700/30 p-4 rounded-lg">
                          <div className="text-sm font-semibold text-gray-400 mb-2">Tomorrow's Priorities:</div>
                          <ul className="space-y-1">
                            {entry.tomorrow_priorities.map((p, i) => (
                              <li key={i} className="text-gray-300 text-sm flex items-center gap-2">
                                <ArrowRight className="w-3 h-3 text-teal-400" /> {p}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </Card>
          </TabsContent>

          {/* Dev Status Tab */}
          <TabsContent value="devstatus" className="space-y-4">
            <DevStatusTab />
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}

// Dev Status Tab Component
function DevStatusTab() {
  const [monitor, setMonitor] = useState<any>(null);
  const [commits, setCommits] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);

  // Fetch GitHub commits on mount
  useEffect(() => {
    async function fetchCommits() {
      try {
        const res = await fetch('https://api.github.com/repos/Tdill1980/wrapdash-shell-78a1c91e/commits?per_page=10');
        const data = await res.json();
        if (Array.isArray(data)) {
          setCommits(data.map((c: any) => ({
            sha: c.sha?.substring(0, 7),
            message: c.commit?.message?.split('\n')[0],
            author: c.commit?.author?.name,
            date: c.commit?.author?.date,
            url: c.html_url
          })));
        }
      } catch (err) {
        console.error('Failed to fetch commits:', err);
      }
    }
    fetchCommits();
  }, []);

  const runHealthCheck = async () => {
    setLoading(true);
    try {
      const res = await fetch('https://qxllysilzonrlyoaomce.supabase.co/functions/v1/wren-monitor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4bGx5c2lsem9ucmx5b2FvbWNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyMzQxMjIsImV4cCI6MjA4MzgxMDEyMn0.s1IyOY7QAVyrTtG_XLhugJUvxi2X_nHCvqvchYCvwtM'
        }
      });
      const data = await res.json();
      setMonitor(data);
      setLastCheck(new Date());
    } catch (err) {
      setMonitor({ overall_status: 'critical', alerts: ['Health check failed: ' + (err as Error).message], checks: [] });
    }
    setLoading(false);
  };

  const statusColors: Record<string, string> = {
    healthy: 'bg-green-500',
    degraded: 'bg-yellow-500',
    critical: 'bg-red-500',
    ok: 'text-green-400 bg-green-500/20',
    warning: 'text-yellow-400 bg-yellow-500/20'
  };

  return (
    <div className="space-y-4">
      {/* Health Check Section */}
      <Card className="bg-gray-800/50 border-cyan-500/30 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-cyan-400 flex items-center gap-2">
            <Bot className="w-6 h-6" /> System Health Check
          </h3>
          <div className="flex items-center gap-3">
            {lastCheck && (
              <span className="text-xs text-gray-500">Last: {lastCheck.toLocaleTimeString()}</span>
            )}
            <Button onClick={runHealthCheck} disabled={loading} size="sm" className="bg-cyan-600 hover:bg-cyan-700">
              {loading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Activity className="w-4 h-4 mr-2" />}
              Run Check
            </Button>
          </div>
        </div>

        {!monitor ? (
          <div className="text-center py-8 text-gray-400">
            <Bot className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Click "Run Check" to test all systems</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Overall Status */}
            <div className="flex items-center gap-4 p-4 bg-gray-900/50 rounded-lg">
              <div className={`w-4 h-4 rounded-full ${statusColors[monitor.overall_status]} animate-pulse`} />
              <div>
                <span className="text-xl font-bold text-white capitalize">System {monitor.overall_status}</span>
                <span className="text-gray-400 ml-3 text-sm">
                  {monitor.checks?.filter((c: any) => c.status === 'ok').length}/{monitor.checks?.length} passing
                </span>
              </div>
              {monitor.metrics && (
                <div className="ml-auto flex gap-4 text-sm">
                  <span className="text-gray-400">Chats: <span className="text-white font-bold">{monitor.metrics.chats_today}</span></span>
                  <span className="text-gray-400">Emails: <span className="text-white font-bold">{monitor.metrics.emails_captured_today}</span></span>
                  <span className="text-gray-400">Rate: <span className="text-white font-bold">{monitor.metrics.email_capture_rate}%</span></span>
                </div>
              )}
            </div>

            {/* Alerts */}
            {monitor.alerts?.length > 0 && (
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                <div className="text-red-400 font-semibold mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> Alerts
                </div>
                {monitor.alerts.map((alert: string, i: number) => (
                  <div key={i} className="text-red-300 text-sm">{alert}</div>
                ))}
              </div>
            )}

            {/* Individual Checks */}
            <div className="grid grid-cols-2 gap-2">
              {monitor.checks?.map((check: any, i: number) => (
                <div key={i} className={`flex items-center justify-between p-3 rounded-lg border ${
                  check.status === 'ok' ? 'bg-green-500/5 border-green-500/20' :
                  check.status === 'warning' ? 'bg-yellow-500/5 border-yellow-500/20' :
                  'bg-red-500/5 border-red-500/20'
                }`}>
                  <div className="flex items-center gap-2">
                    {check.status === 'ok' ? <CheckCircle className="w-4 h-4 text-green-400" /> :
                     check.status === 'warning' ? <AlertTriangle className="w-4 h-4 text-yellow-400" /> :
                     <AlertTriangle className="w-4 h-4 text-red-400" />}
                    <span className="text-white text-sm">{check.name}</span>
                  </div>
                  <span className="text-xs text-gray-500">{check.latency_ms}ms</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Recent Commits */}
      <Card className="bg-gray-800/50 border-purple-500/30 p-6">
        <h3 className="text-xl font-bold text-purple-400 flex items-center gap-2 mb-4">
          <Code className="w-6 h-6" /> Recent Code Changes
        </h3>
        <div className="space-y-2">
          {commits.length === 0 ? (
            <div className="text-gray-400 text-center py-4">Loading commits...</div>
          ) : (
            commits.map((commit) => (
              <a
                key={commit.sha}
                href={commit.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 bg-gray-900/50 rounded-lg hover:bg-gray-900 transition-colors"
              >
                <span className="font-mono text-purple-400 text-xs">{commit.sha}</span>
                <span className="text-white text-sm flex-1 truncate">{commit.message}</span>
                <span className="text-gray-500 text-xs">{new Date(commit.date).toLocaleDateString()}</span>
              </a>
            ))
          )}
        </div>
      </Card>

      {/* Key Files */}
      <Card className="bg-gray-800/50 border-teal-500/30 p-6">
        <h3 className="text-xl font-bold text-teal-400 flex items-center gap-2 mb-4">
          <FileText className="w-6 h-6" /> Key System Files
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {[
            { path: 'public/embed/chat-widget.js', desc: 'Chat widget' },
            { path: 'supabase/functions/command-chat/index.ts', desc: 'AI Chat Kernel' },
            { path: 'supabase/functions/wren-monitor/index.ts', desc: 'Health monitor' },
            { path: 'supabase/functions/cmd-vehicle/index.ts', desc: 'Vehicle lookup' },
            { path: 'supabase/functions/cmd-pricing/index.ts', desc: 'Pricing calc' },
            { path: 'supabase/functions/create-quote-from-chat/index.ts', desc: 'Quote + email' },
          ].map((file) => (
            <a
              key={file.path}
              href={`https://github.com/Tdill1980/wrapdash-shell-78a1c91e/blob/main/${file.path}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-2 bg-gray-900/50 rounded hover:bg-gray-900 transition-colors"
            >
              <FileText className="w-4 h-4 text-teal-400 flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-xs text-teal-300 font-mono truncate">{file.path.split('/').pop()}</div>
                <div className="text-xs text-gray-500">{file.desc}</div>
              </div>
            </a>
          ))}
        </div>
      </Card>
    </div>
  );
}
