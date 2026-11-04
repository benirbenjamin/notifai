import React, { useState, useEffect } from 'react';
import api from '../api/client';
import TaskCard from '../components/TaskCard';
import CreateTaskModal from '../components/CreateTaskModal';
import { 
  Plus, 
  Search, 
  Filter, 
  CheckSquare, 
  Clock, 
  DollarSign, 
  ShoppingBag, 
  Repeat,
  Layers
} from 'lucide-react';

export default function TasksPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Filters
  const [selectedType, setSelectedType] = useState('all');
  const [selectedPriority, setSelectedPriority] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all'); // all, pending, completed
  const [searchQuery, setSearchQuery] = useState('');

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const params = {};
      if (selectedType !== 'all') params.type = selectedType;
      if (selectedPriority !== 'all') params.priority = selectedPriority;
      if (statusFilter === 'pending') params.isCompleted = 'false';
      if (statusFilter === 'completed') params.isCompleted = 'true';
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const res = await api.get('/tasks', { params });
      setTasks(res.data.tasks || []);
    } catch (err) {
      console.error('Failed to load tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [selectedType, selectedPriority, statusFilter, searchQuery]);

  const handleToggle = async (taskId) => {
    try {
      await api.patch(`/tasks/${taskId}/toggle`);
      fetchTasks();
    } catch (err) {
      console.error('Toggle error:', err);
    }
  };

  const handleDelete = async (taskId) => {
    if (!window.confirm('Delete this task?')) return;
    try {
      await api.delete(`/tasks/${taskId}`);
      fetchTasks();
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const handleCreateTask = async (taskData) => {
    await api.post('/tasks', taskData);
    fetchTasks();
  };

  const typeTabs = [
    { id: 'all', label: 'All Tasks', icon: Layers },
    { id: 'general', label: 'General', icon: CheckSquare },
    { id: 'timed', label: 'Timed Tasks', icon: Clock },
    { id: 'payment', label: 'Payments', icon: DollarSign },
    { id: 'purchase', label: 'Purchase Goals', icon: ShoppingBag },
    { id: 'recurring', label: 'Recurring', icon: Repeat },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Task Management</h1>
          <p className="text-xs text-slate-400 mt-1">
            Manage your personal activities, countdowns, and financial goals.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-md shadow-cyan-500/20 flex items-center active:scale-95 transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Task
        </button>
      </div>

      {/* Filter Tabs by Task Type */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-2 scrollbar-none">
        {typeTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = selectedType === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setSelectedType(tab.id)}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                isActive 
                  ? 'bg-cyan-500 text-white shadow-md shadow-cyan-500/20' 
                  : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Search & Sub-filters Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-900 border border-slate-800 rounded-2xl">
        
        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search by title or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors"
          />
        </div>

        {/* Priority Filter */}
        <select
          value={selectedPriority}
          onChange={(e) => setSelectedPriority(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
        >
          <option value="all">All Priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
        >
          <option value="all">All Statuses</option>
          <option value="pending">Pending Only</option>
          <option value="completed">Completed Only</option>
        </select>

      </div>

      {/* Task List */}
      {loading ? (
        <div className="py-16 text-center text-slate-500 text-sm">
          Loading tasks...
        </div>
      ) : tasks.length === 0 ? (
        <div className="py-16 text-center rounded-2xl bg-slate-900/40 border border-slate-800 space-y-3">
          <Layers className="w-10 h-10 text-slate-600 mx-auto" />
          <p className="text-sm font-semibold text-white">No tasks found</p>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {searchQuery || selectedType !== 'all' 
              ? 'Try adjusting your filters or search query.' 
              : 'Create your first task to start tracking deadlines and reminders.'}
          </p>
          <button
            onClick={() => setIsModalOpen(true)}
            className="mt-2 inline-flex items-center px-4 py-2 rounded-xl text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-white"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Create Task
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      <CreateTaskModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onTaskCreated={handleCreateTask}
      />

    </div>
  );
}
