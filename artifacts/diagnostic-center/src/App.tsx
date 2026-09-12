import { type ButtonHTMLAttributes, type FormEvent, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Switch, Router as WouterRouter, useLocation, useRoute } from 'wouter';
import {
  Activity as ActivityIcon, ArrowUpRight, BarChart3, Bell, CalendarDays,
  Check, CheckCircle2, ChevronLeft, ChevronRight, CircleDollarSign,
  FileText, FlaskConical, LayoutDashboard, Menu, MoreHorizontal, Phone,
  Plus, ReceiptText, RefreshCw, Search, Settings, SlidersHorizontal, Stethoscope,
  UserRound, UsersRound, WalletCards, X, XCircle, Shield, Package, Clock,
  MessageSquare, History, UserCheck, Tag, Upload, Edit3, Info, Eye, Download,
  ArrowLeft, FileCheck, DollarSign, Home, MapPin, Truck, Trash2, Filter, AlertTriangle, Send,
  Building2, CreditCard, HandCoins, Mail
} from 'lucide-react';
import {
  getGetDashboardSummaryQueryKey, getListAppointmentsQueryKey, getListPatientsQueryKey,
  useCreatePatient, useGetDashboardSummary,
  useListActivity, useListAppointments, useListPatients, useListSlots, useListTests
} from '@workspace/api-client-react';
import type {
  Activity, DashboardSummary, Patient, PatientInput, Slot, Test
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import NotFound from '@/pages/not-found';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { toast } from 'sonner';

const queryClient = new QueryClient();
const today = new Date().toISOString().slice(0, 10);

type Role = 'SUPER_ADMIN' | 'ADMIN' | 'FRONTDESK' | 'AGENT' | 'DOCTOR';

interface TestItemSnapshot {
  testId: string;
  testCode: string;
  testName: string;
  price: number;
  partnerShare: number;
  agentIncentive: number;
  instructions?: string;
  parameters?: TestParameter[];
  quantity: number;
  lineTotal?: number;
}

interface TestParameter {
  id: string;
  name: string;
  unit?: string;
  normalRange?: string;
}

interface PartnerLabTest {
  id: string;
  name: string;
  testCode: string;
  category?: string;
  department?: string;
  price: number;
  b2bCost?: number;
  partnerShare: number;
  agentIncentive: number;
  turnaround?: string;
  sampleType?: string;
  instructions?: string;
  parameters?: TestParameter[];
  active?: boolean;
}

interface PartnerLab {
  id: string;
  name: string;
  address: string;
  city?: string;
  phone?: string;
  email?: string;
  contactPerson?: string;
  active?: boolean;
  tests: PartnerLabTest[];
  createdAt?: string;
  updatedAt?: string;
}

interface ExtendedAppointment {
  id: string;
  patientId: string;
  patientName: string;
  uhid: string;
  mobile: string;
  testId?: string;
  testName: string;
  lab: string;
  branch: string;
  partnerLabId?: string;
  partnerLabName?: string;
  partnerLabAddress?: string;
  date: string;
  time: string;
  doctor?: string | null;
  referredBy?: string | null;
  status: string;
  paymentStatus: string;
  paymentCollectedBy?: 'Oxycare' | 'Partner';
  reportStatus?: string;
  amount: number;
  totalPrice?: number;
  advancePayment?: number;
  remainingAmount?: number;
  source: string;
  createdBy: string;
  prescriptionUrl?: string | null;
  invoiceUrl?: string | null;
  reportUrl?: string | null;
  notes?: string | null;
  bookingType?: 'Lab Visit' | 'Home Collection';
  address?: string | null;
  pinCode?: string | null;
  collectionDate?: string | null;
  timeSlot?: string | null;
  items?: TestItemSnapshot[];
  totalPartnerShare?: number;
  totalAgentIncentive?: number;
  updatedAt?: string;
}

interface UserAccount {
  id: string;
  name: string;
  email: string;
  role: Role;
  branch?: string;
  mobile?: string;
  designation?: string;
  active: boolean;
  permissions?: string[];
}

interface PermissionDef {
  id: string;
  label: string;
  category: 'Clinical & Bookings' | 'Financials & Ledgers' | 'Administrative & Security';
  description: string;
}

const ALL_PERMISSIONS: PermissionDef[] = [
  { id: 'book_appointments', label: 'Book Appointments', category: 'Clinical & Bookings', description: 'Create and modify patient diagnostic bookings' },
  { id: 'change_status', label: 'Update Test & Report Status', category: 'Clinical & Bookings', description: 'Change sample processing and report status' },
  { id: 'upload_documents', label: 'Upload Prescriptions & Reports', category: 'Clinical & Bookings', description: 'Attach prescriptions, invoices, and lab PDF reports' },
  { id: 'manage_slots', label: 'Manage Slot Capacity', category: 'Clinical & Bookings', description: 'Create and adjust daily appointment slot limits' },

  { id: 'manage_pricing', label: 'Manage Test & Partner Pricing', category: 'Financials & Ledgers', description: 'Configure test MRP, doctor share, and agent incentives' },
  { id: 'view_ledgers', label: 'View Passbook Ledgers', category: 'Financials & Ledgers', description: 'Access doctor and agent commission ledgers' },
  { id: 'export_reports', label: 'Export Financial Reports', category: 'Financials & Ledgers', description: 'Download CSV audit logs and monthly balances' },

  { id: 'manage_users', label: 'Manage User Accounts', category: 'Administrative & Security', description: 'Create user accounts and adjust access permissions' },
  { id: 'whatsapp_comm', label: 'WhatsApp Communications', category: 'Administrative & Security', description: 'Send automated WhatsApp report notifications' },
  { id: 'view_audit_logs', label: 'View Audit Logs', category: 'Administrative & Security', description: 'Inspect detailed system access and edit history' },
];

const ROLE_DEFAULT_PERMISSIONS: Record<Role, string[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS.map((p) => p.id),
  ADMIN: ['book_appointments', 'change_status', 'manage_pricing', 'view_ledgers', 'upload_documents', 'manage_users', 'manage_slots', 'export_reports', 'whatsapp_comm', 'view_audit_logs'],
  DOCTOR: ['change_status', 'view_ledgers', 'upload_documents'],
  AGENT: ['book_appointments', 'change_status', 'view_ledgers'],
  FRONTDESK: ['book_appointments', 'change_status', 'upload_documents', 'manage_slots'],
};

function hasPermission(user: UserAccount, permissionId: string): boolean {
  if (user.role === 'SUPER_ADMIN') return true;
  if (user.permissions && user.permissions.length > 0) {
    return user.permissions.includes(permissionId);
  }
  const defaults = ROLE_DEFAULT_PERMISSIONS[user.role] || [];
  return defaults.includes(permissionId);
}

function roleBadgeTone(role: Role): string {
  switch (role) {
    case 'SUPER_ADMIN': return 'bg-purple-100 text-purple-800 border-purple-300';
    case 'ADMIN': return 'bg-indigo-100 text-indigo-800 border-indigo-300';
    case 'DOCTOR': return 'bg-teal-100 text-teal-800 border-teal-300';
    case 'AGENT': return 'bg-amber-100 text-amber-800 border-amber-300';
    case 'FRONTDESK': return 'bg-blue-100 text-blue-800 border-blue-300';
    default: return 'bg-gray-100 text-gray-800 border-gray-300';
  }
}

function saveUserSession(user: UserAccount | null) {
  if (typeof window === 'undefined') return;
  if (user) {
    localStorage.setItem('diagnostic-user-session', JSON.stringify(user));
    sessionStorage.setItem('diagnostic-user-session', JSON.stringify(user));
  } else {
    localStorage.removeItem('diagnostic-user-session');
    sessionStorage.removeItem('diagnostic-user-session');
  }
}

interface LedgerItem {
  id: string;
  date: string;
  particulars: string;
  spends?: number | null;
  deposits?: number | null;
  balance: number;
  userRef?: string;
  role?: string;
  transactionType?: 'Booking' | 'Payment' | 'Adjustment' | 'Refund' | 'Commission';
  bookingId?: string | null;
  patientName?: string | null;
  testSummary?: string | null;
  partnerShare?: number;
  agentIncentive?: number;
  remarks?: string;
  paymentCollectedBy?: 'Oxycare' | 'Partner';
  createdBy?: string;
  hasInfo?: boolean;
}

interface MonthlySummaryData {
  userRef: string;
  month: string;
  openingBalance: number;
  totalCredit: number;
  totalDebit: number;
  totalPartnerShare: number;
  totalAgentIncentive: number;
  totalAdjustments: number;
  closingBalance: number;
}

const navItems = [
  { href: '/', label: 'Overview', icon: LayoutDashboard, roles: ['SUPER_ADMIN', 'ADMIN', 'FRONTDESK', 'AGENT', 'DOCTOR'] },
  { href: '/appointments', label: 'Appointments Queue', icon: CalendarDays, roles: ['SUPER_ADMIN', 'ADMIN', 'FRONTDESK', 'AGENT', 'DOCTOR'] },
  { href: '/slots', label: 'Slots & Capacity', icon: Clock, roles: ['SUPER_ADMIN', 'ADMIN', 'FRONTDESK'] },
  { href: '/partner-labs', label: 'Partner Labs', icon: Building2, roles: ['SUPER_ADMIN', 'ADMIN', 'FRONTDESK'] },
  { href: '/doctor-dashboard', label: 'Doctor Ledger', icon: ReceiptText, roles: ['SUPER_ADMIN', 'ADMIN', 'DOCTOR'] },
  { href: '/referral-portal', label: 'Agent Ledger', icon: WalletCards, roles: ['SUPER_ADMIN', 'ADMIN', 'AGENT'] },
  { href: '/patients', label: 'Patients Master', icon: UsersRound, roles: ['SUPER_ADMIN', 'ADMIN', 'FRONTDESK', 'AGENT', 'DOCTOR'] },
  { href: '/users', label: 'User & Permissions', icon: UserCheck, roles: ['SUPER_ADMIN', 'ADMIN'] },
  { href: '/doctor-pricing', label: 'Doctor Pricing', icon: Tag, roles: ['SUPER_ADMIN', 'ADMIN'] },
  { href: '/tests', label: 'Test Catalogue', icon: FlaskConical, roles: ['SUPER_ADMIN', 'ADMIN', 'FRONTDESK', 'AGENT', 'DOCTOR'] },
  { href: '/whatsapp', label: 'WhatsApp Comm', icon: MessageSquare, roles: ['SUPER_ADMIN', 'ADMIN'] },
  { href: '/audit-logs', label: 'Audit Logs', icon: History, roles: ['SUPER_ADMIN', 'ADMIN'] },
];

function cx(...classes: Array<string | false | null | undefined>) { return classes.filter(Boolean).join(' '); }
function money(value = 0) { return `₹ ${value.toLocaleString('en-IN')}`; }
function formatDay(value?: string) {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function initials(name = '') { return name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase() || 'PT'; }
function statusTone(status = '') {
  const normalized = status.toLowerCase();
  if (['confirmed', 'completed', 'paid', 'ready', 'available', 'active', 'report ready'].includes(normalized)) return 'bg-[#e5f5f1] text-[#167366] border border-[#bce4db]';
  if (['pending', 'pending payment', 'partial', 'processing', 'in process', 'sample collected', 'patient arrived'].includes(normalized)) return 'bg-[#fff2dd] text-[#a96816] border border-[#f5dfb8]';
  if (['cancelled', 'failed', 'unpaid', 'blocked', 'full', 'inactive'].includes(normalized)) return 'bg-[#fce9e8] text-[#b34b48] border border-[#f3c8c6]';
  return 'bg-[#e9f0f5] text-[#536675] border border-[#d2dfa8]';
}
function titleCase(value = '') { return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }

function Panel({ children, className = '', ...props }: { children: ReactNode; className?: string } & HTMLAttributes<HTMLElement>) {
  return <section className={cx('rounded-2xl border border-border bg-card shadow-[0_5px_18px_hsl(210_20%_60%_/_0.06)]', className)} {...props}>{children}</section>;
}
function PageTitle({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail: string; action?: ReactNode }) {
  return <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
    <div><div className="mono mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">{eyebrow}</div><h1 className="text-[28px] font-bold tracking-[-0.04em] text-foreground md:text-[34px]">{title}</h1><p className="mt-1 text-sm text-muted-foreground">{detail}</p></div>
    {action}
  </div>;
}
function Button({ children, variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  return <button className={cx('inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-transform duration-200 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50', variant === 'primary' && 'bg-primary text-primary-foreground hover:brightness-105', variant === 'secondary' && 'border border-border bg-card text-foreground hover:bg-muted', variant === 'ghost' && 'text-muted-foreground hover:bg-muted hover:text-foreground', variant === 'danger' && 'bg-destructive text-destructive-foreground hover:brightness-105', className)} {...props}>{children}</button>;
}
function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return <label className={cx('block space-y-1.5', className)}><span className="text-xs font-semibold text-muted-foreground">{label}</span>{children}</label>;
}
function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx('h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15', className)} {...props} />;
}
function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx('h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15', className)} {...props} />;
}
function EmptyState({ icon: Icon, title, detail, action }: { icon: typeof Search; title: string; detail: string; action?: ReactNode }) {
  return <div className="flex min-h-[230px] flex-col items-center justify-center px-6 text-center"><div className="mb-3 rounded-2xl bg-muted p-3 text-primary"><Icon size={22} /></div><h3 className="font-semibold">{title}</h3><p className="mt-1 max-w-sm text-sm text-muted-foreground">{detail}</p>{action && <div className="mt-4">{action}</div>}</div>;
}
function QueryState({ loading, error, children, empty, retry }: { loading: boolean; error: boolean; children: ReactNode; empty?: boolean; retry?: () => void }) {
  if (loading) return <div className="space-y-3 p-5">{[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>;
  if (error) return <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 p-6 text-center"><XCircle className="text-destructive" size={28} /><h3 className="font-semibold">Could not load this view</h3><p className="text-sm text-muted-foreground">The workspace service did not respond. Try again.</p>{retry && <Button variant="secondary" onClick={retry}><RefreshCw size={15} /> Retry</Button>}</div>;
  if (empty) return <>{children}</>;
  return <>{children}</>;
}

// Universal Top-Level Modal Portal (always renders at document.body, z-[99999], completely covering sidebar and top header without any clipping or white bars)
interface ModalPortalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
  className?: string;
}

function ModalPortal({ isOpen, onClose, children, maxWidth = 'max-w-2xl', className = '' }: ModalPortalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const widthMap: Record<string, string> = {
    'max-w-xs': '380px',
    'max-w-sm': '440px',
    'max-w-md': '520px',
    'max-w-lg': '620px',
    'max-w-xl': '720px',
    'max-w-2xl': '840px',
    'max-w-3xl': '960px',
    'max-w-4xl': '1120px',
    'max-w-5xl': '1280px',
  };
  const resolvedMaxWidth = widthMap[maxWidth] || (maxWidth.startsWith('max-w-') ? undefined : maxWidth) || '720px';

  return createPortal(
    <div
      className="modal-portal-backdrop animate-in fade-in duration-150"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(15, 23, 42, 0.70)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        padding: '1rem',
        overflowY: 'auto'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cx('modal-portal-card animate-in zoom-in-95 duration-150', maxWidth, className)}
        style={{
          maxWidth: resolvedMaxWidth,
          width: '100%',
          zIndex: 100000,
          margin: 'auto',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 'calc(100vh - 3rem)',
          backgroundColor: 'hsl(var(--card))',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.5)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}

interface SystemNotification {
  id: string;
  title: string;
  message: string;
  targetType?: 'ALL' | 'ROLES' | 'USERS';
  targetRoles?: string[];
  targetUserEmails?: string[];
  targetRole?: 'ALL' | Role;
  priority: 'Normal' | 'Important' | 'Urgent';
  createdBy: string;
  creatorRole: string;
  createdAt: string;
  readBy: string[];
}

// Department Notification Center & Granular Account / Role Targeted Broadcast Gateway
function NotificationCenter({ currentUser }: { currentUser: UserAccount }) {
  const [open, setOpen] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [allUsers, setAllUsers] = useState<UserAccount[]>([]);
  const [adminTab, setAdminTab] = useState<'inbox' | 'manage'>('inbox');

  // Create Form State
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [targetType, setTargetType] = useState<'ALL' | 'ROLES' | 'USERS'>('ALL');
  const [selectedRoles, setSelectedRoles] = useState<Role[]>(['DOCTOR', 'AGENT', 'FRONTDESK']);
  const [selectedUserEmails, setSelectedUserEmails] = useState<string[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [priority, setPriority] = useState<'Normal' | 'Important' | 'Urgent'>('Normal');
  const [submitting, setSubmitting] = useState(false);

  // STRICTLY restricted to SUPER_ADMIN per user instructions
  const isSuperAdmin = currentUser.role === 'SUPER_ADMIN';

  const loadNotifications = async () => {
    try {
      const res = await fetch(`/api/notifications?role=${currentUser.role}&userEmail=${encodeURIComponent(currentUser.email)}`);
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      }
    } catch {}
  };

  const loadUsers = async () => {
    if (!isSuperAdmin) return;
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        const data = await res.json();
        setAllUsers(data);
      }
    } catch {}
  };

  useEffect(() => {
    loadNotifications();
    const timer = setInterval(loadNotifications, 8000);
    return () => clearInterval(timer);
  }, [currentUser]);

  useEffect(() => {
    if (showCreateModal && isSuperAdmin) {
      loadUsers();
    }
  }, [showCreateModal, isSuperAdmin]);

  const unreadCount = notifications.filter(
    (n) => !Array.isArray(n.readBy) || !n.readBy.includes(currentUser.email)
  ).length;

  const markAsRead = async (notifId: string) => {
    try {
      await fetch(`/api/notifications/${notifId}/read`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userEmail: currentUser.email }),
      });
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notifId ? { ...n, readBy: [...(n.readBy || []), currentUser.email] } : n
        )
      );
    } catch {}
  };

  const markAllAsRead = async () => {
    const unread = notifications.filter(
      (n) => !Array.isArray(n.readBy) || !n.readBy.includes(currentUser.email)
    );
    for (const n of unread) {
      markAsRead(n.id);
    }
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) return;
    if (!isSuperAdmin) {
      toast.error('Only Super Admin can broadcast notifications');
      return;
    }

    if (targetType === 'ROLES' && selectedRoles.length === 0) {
      toast.error('Please select at least one role to target.');
      return;
    }
    if (targetType === 'USERS' && selectedUserEmails.length === 0) {
      toast.error('Please select at least one user account to target.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          message,
          targetType,
          targetRoles: targetType === 'ROLES' ? selectedRoles : [],
          targetUserEmails: targetType === 'USERS' ? selectedUserEmails : [],
          targetRole: targetType === 'ROLES' && selectedRoles.length === 1 ? selectedRoles[0] : 'ALL',
          priority,
          createdBy: currentUser.name,
          creatorRole: 'SUPER_ADMIN',
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to broadcast');
      }
      toast.success(
        targetType === 'ALL'
          ? 'Broadcasted to all accounts!'
          : targetType === 'ROLES'
          ? `Broadcasted to roles: ${selectedRoles.join(', ')}`
          : `Broadcasted to ${selectedUserEmails.length} selected accounts!`
      );
      setTitle('');
      setMessage('');
      setSelectedUserEmails([]);
      setTargetType('ALL');
      setShowCreateModal(false);
      loadNotifications();
    } catch (err: any) {
      toast.error(err.message || 'Failed to broadcast notification');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (notifId: string) => {
    if (!isSuperAdmin) return;
    if (!confirm('Are you sure you want to permanently delete and revoke this notification?')) return;
    try {
      const res = await fetch(`/api/notifications/${notifId}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Notification removed');
        setNotifications((prev) => prev.filter((n) => n.id !== notifId));
      } else {
        throw new Error();
      }
    } catch {
      toast.error('Failed to delete notification');
    }
  };

  const toggleRole = (r: Role) => {
    setSelectedRoles((prev) => prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]);
  };

  const toggleUserEmail = (email: string) => {
    setSelectedUserEmails((prev) => prev.includes(email) ? prev.filter((x) => x !== email) : [...prev, email]);
  };

  const filteredUsers = allUsers.filter(
    (u) =>
      u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.role.toLowerCase().includes(userSearch.toLowerCase())
  );

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => setOpen((prev) => !prev)}
        className="relative grid size-9 place-items-center rounded-xl border border-border bg-card text-muted-foreground hover:bg-muted shadow-sm transition-colors cursor-pointer"
      >
        <Bell size={16} />
        {unreadCount > 0 ? (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground animate-pulse shadow-sm">
            {unreadCount}
          </span>
        ) : (
          <span className="absolute right-2 top-2 size-1.5 rounded-full bg-primary/40" />
        )}
      </button>

      {/* Notification Dropdown Panel */}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[380px] sm:w-[440px] rounded-2xl border border-border bg-card shadow-2xl p-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Bell size={15} />
                </div>
                <div>
                  <h4 className="font-bold text-xs text-foreground">Department Notifications</h4>
                  <div className="mono text-[10px] text-muted-foreground">
                    {unreadCount > 0 ? `${unreadCount} unread announcements` : 'All caught up'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {isSuperAdmin && (
                  <button
                    type="button"
                    onClick={() => { setShowCreateModal(true); setOpen(false); }}
                    className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
                  >
                    <Plus size={13} /> New Broadcast
                  </button>
                )}
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={markAllAsRead}
                    className="text-[10px] text-primary hover:underline font-semibold px-1"
                  >
                    Mark All Read
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-muted ml-1"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Super Admin Switch Tabs (Inbox vs Manage Sent Broadcasts) */}
            {isSuperAdmin && (
              <div className="flex border-b border-border pt-2 pb-1 gap-4 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setAdminTab('inbox')}
                  className={cx(
                    'pb-1.5 transition-colors border-b-2 -mb-[5px]',
                    adminTab === 'inbox' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
                  )}
                >
                  Inbox & Alerts ({notifications.length})
                </button>
                <button
                  type="button"
                  onClick={() => setAdminTab('manage')}
                  className={cx(
                    'pb-1.5 transition-colors border-b-2 -mb-[5px]',
                    adminTab === 'manage' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
                  )}
                >
                  Manage Sent Announcements
                </button>
              </div>
            )}

            {/* Notification List */}
            <div className="mt-3 max-h-[360px] overflow-y-auto space-y-2.5 pr-1 scrollbar-thin">
              {notifications.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  <Bell size={24} className="mx-auto mb-2 opacity-30" />
                  No announcements recorded yet.
                </div>
              ) : (
                notifications.map((n) => {
                  const isRead = Array.isArray(n.readBy) && n.readBy.includes(currentUser.email);
                  
                  // Format target description
                  let targetDesc = '🌐 All Accounts';
                  if (n.targetType === 'ROLES' && n.targetRoles?.length) {
                    targetDesc = `👥 Roles: ${n.targetRoles.join(', ')}`;
                  } else if (n.targetType === 'USERS' && n.targetUserEmails?.length) {
                    targetDesc = `👤 ${n.targetUserEmails.length} Specified Account${n.targetUserEmails.length > 1 ? 's' : ''}`;
                  } else if (n.targetRole && n.targetRole !== 'ALL') {
                    targetDesc = `👥 Role: ${n.targetRole}`;
                  }

                  return (
                    <div
                      key={n.id}
                      className={cx(
                        'rounded-xl border p-3 text-xs transition-all relative',
                        isRead ? 'border-border/60 bg-muted/20 opacity-85' : 'border-primary/30 bg-primary/5 shadow-xs'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-foreground">{n.title}</span>
                          <span
                            className={cx(
                              'mono rounded px-1.5 py-0.5 text-[9px] font-bold',
                              n.priority === 'Urgent'
                                ? 'bg-destructive/15 text-destructive'
                                : n.priority === 'Important'
                                ? 'bg-amber-500/15 text-amber-700'
                                : 'bg-primary/10 text-primary'
                            )}
                          >
                            {n.priority}
                          </span>
                          <span className="mono rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground" title={n.targetUserEmails?.join(', ')}>
                            {targetDesc}
                          </span>
                        </div>
                        {isSuperAdmin && (
                          <button
                            type="button"
                            onClick={() => handleDelete(n.id)}
                            title="Delete notification (revokes from all accounts)"
                            className="text-muted-foreground hover:text-destructive cursor-pointer p-0.5"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>

                      <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed whitespace-pre-wrap">
                        {n.message}
                      </p>

                      <div className="mt-2 flex items-center justify-between border-t border-border/40 pt-1.5 text-[10px] text-muted-foreground/75">
                        <span>By {n.createdBy} · {new Date(n.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                        <div className="flex items-center gap-2">
                          {isSuperAdmin && n.readBy && (
                            <span className="mono font-semibold text-primary">
                              Read by {n.readBy.length}
                            </span>
                          )}
                          {!isRead && (
                            <button
                              type="button"
                              onClick={() => markAsRead(n.id)}
                              className="font-bold text-primary hover:underline cursor-pointer"
                            >
                              Mark Read
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}

      {/* Super Admin Create Notification Modal */}
      <ModalPortal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} maxWidth="max-w-xl">
        <div className="flex shrink-0 items-center justify-between p-6 pb-4 border-b border-border bg-card">
          <div className="flex items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Send size={18} />
            </div>
            <div>
              <div className="mono text-[10px] font-bold uppercase tracking-[.18em] text-primary">Super Admin Command Center</div>
              <h3 className="font-bold text-base text-foreground">Broadcast Department Notification</h3>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateModal(false)}
            className="grid size-8 place-items-center rounded-xl text-muted-foreground hover:bg-muted"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleCreate} className="flex flex-col min-h-0 flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 scrollbar-thin space-y-4">
            <Field label="Notification Headline / Title *">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Center Maintenance / Price Revision / Urgent Notice"
                required
              />
            </Field>

            <Field label="Urgency / Priority Level">
              <Select
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
              >
                <option value="Normal">🟢 Normal (Info & General Notice)</option>
                <option value="Important">🟡 Important (Action Recommended)</option>
                <option value="Urgent">🔴 Urgent (Immediate Attention Required)</option>
              </Select>
            </Field>

            {/* Granular Audience Selector */}
            <div className="rounded-2xl border border-border bg-muted/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-foreground flex items-center gap-2">
                  <UsersRound size={14} className="text-primary" /> Target Audience Accounts *
                </label>
                <span className="text-[10px] text-muted-foreground mono">Super Admin Control</span>
              </div>

              {/* Mode Toggle */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setTargetType('ALL')}
                  className={cx(
                    'py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer',
                    targetType === 'ALL'
                      ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                      : 'bg-card text-muted-foreground border-border hover:bg-muted'
                  )}
                >
                  🌐 All Accounts
                </button>
                <button
                  type="button"
                  onClick={() => setTargetType('ROLES')}
                  className={cx(
                    'py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer',
                    targetType === 'ROLES'
                      ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                      : 'bg-card text-muted-foreground border-border hover:bg-muted'
                  )}
                >
                  👥 By Roles
                </button>
                <button
                  type="button"
                  onClick={() => setTargetType('USERS')}
                  className={cx(
                    'py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer',
                    targetType === 'USERS'
                      ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                      : 'bg-card text-muted-foreground border-border hover:bg-muted'
                  )}
                >
                  👤 Specific Users
                </button>
              </div>

              {/* Roles Selector Sub-View */}
              {targetType === 'ROLES' && (
                <div className="pt-2 animate-in fade-in space-y-2">
                  <div className="text-[11px] text-muted-foreground">Select user roles who should receive this notification:</div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { role: 'DOCTOR' as Role, label: 'Referring Doctors', icon: '🩺' },
                      { role: 'AGENT' as Role, label: 'Referral Agents', icon: '🤝' },
                      { role: 'FRONTDESK' as Role, label: 'Frontdesk Staff', icon: '🏢' },
                      { role: 'ADMIN' as Role, label: 'Center Admins', icon: '🛡️' },
                    ].map((item) => {
                      const checked = selectedRoles.includes(item.role);
                      return (
                        <label
                          key={item.role}
                          className={cx(
                            'flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer text-xs transition-colors',
                            checked ? 'bg-primary/10 border-primary/40 font-bold text-foreground' : 'bg-card border-border text-muted-foreground hover:bg-muted/40'
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleRole(item.role)}
                            className="size-4 rounded text-primary focus:ring-primary"
                          />
                          <span>{item.icon} {item.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Specific Users Selector Sub-View */}
              {targetType === 'USERS' && (
                <div className="pt-2 animate-in fade-in space-y-2.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">Select specific user accounts ({selectedUserEmails.length} selected):</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedUserEmails(allUsers.map((u) => u.email))}
                        className="text-primary hover:underline font-bold text-[10px]"
                      >
                        Select All
                      </button>
                      <span className="text-muted-foreground">•</span>
                      <button
                        type="button"
                        onClick={() => setSelectedUserEmails([])}
                        className="text-destructive hover:underline font-bold text-[10px]"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                    <Input
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      placeholder="Search accounts by name, role, email..."
                      className="pl-8 text-xs h-9"
                    />
                  </div>

                  <div className="max-h-44 overflow-y-auto rounded-xl border border-border bg-card p-1.5 space-y-1 scrollbar-thin">
                    {filteredUsers.length === 0 ? (
                      <div className="py-4 text-center text-xs text-muted-foreground">No accounts match search.</div>
                    ) : (
                      filteredUsers.map((u) => {
                        const checked = selectedUserEmails.includes(u.email);
                        return (
                          <label
                            key={u.id}
                            className={cx(
                              'flex items-center justify-between p-2 rounded-lg cursor-pointer text-xs transition-colors',
                              checked ? 'bg-primary/10 font-semibold' : 'hover:bg-muted/40 text-muted-foreground'
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleUserEmail(u.email)}
                                className="size-3.5 rounded text-primary focus:ring-primary"
                              />
                              <div>
                                <div className="text-foreground text-xs font-bold">{u.name}</div>
                                <div className="mono text-[10px] text-muted-foreground">{u.email}</div>
                              </div>
                            </div>
                            <span className="mono rounded bg-muted px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">
                              {u.role}
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            <Field label="Notification Message Body *">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type the message content that recipients will see..."
                rows={4}
                required
                className="w-full rounded-xl border border-input bg-background p-3 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </Field>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-muted/20 px-6 py-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowCreateModal(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} className="font-bold gap-1.5">
              {submitting ? 'Broadcasting...' : 'Broadcast Notification'} <Send size={14} />
            </Button>
          </div>
        </form>
      </ModalPortal>
    </div>
  );
}

// Global Shell Navigation
function Shell({ children, currentUser, onLogout, onSwitchUser }: { children: ReactNode; currentUser: UserAccount; onLogout: () => void; onSwitchUser: (user: UserAccount) => void }) {
  const [location] = useLocation();
  const [mobileNav, setMobileNav] = useState(false);
  const [profileMenu, setProfileMenu] = useState(false);
  const allowedNav = navItems.filter((item) => item.roles.includes(currentUser.role));
  const current = navItems.find((item) => item.href === location)?.label || (location.startsWith('/appointments/') ? 'Appointment Details' : 'Workspace');

  return <div className="min-h-[100dvh] bg-background text-foreground">
    <aside className={cx('fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col bg-sidebar px-4 py-5 text-sidebar-foreground transition-transform duration-300 md:translate-x-0', mobileNav ? 'translate-x-0' : '-translate-x-full')}>
      <div className="flex items-center gap-3 px-3 mb-6">
        <div className="grid size-9 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground"><Stethoscope size={19} /></div>
        <div><div className="text-sm font-bold tracking-tight text-white">Oxycare Diagnostics</div><div className="mono text-[9px] uppercase tracking-[.16em] text-sidebar-foreground/60">Operations Suite</div></div>
      </div>

      <div className="mono mb-2 px-3 text-[10px] font-bold uppercase tracking-[.18em] text-sidebar-foreground/45">Navigation</div>
      <nav className="space-y-1 overflow-y-auto max-h-[calc(100vh-220px)] scrollbar-thin">
        {allowedNav.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} onClick={() => setMobileNav(false)} className={cx('group flex h-9 items-center gap-3 rounded-xl px-3 text-xs font-medium transition-colors', location === href ? 'bg-sidebar-accent text-white font-semibold' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-white')}>
            <Icon size={16} className={location === href ? 'text-sidebar-primary' : ''} />
            <span>{label}</span>
            {href === '/appointments' && <span className="mono ml-auto rounded-md bg-sidebar-primary/15 px-1.5 py-0.5 text-[9px] text-sidebar-primary">LIVE</span>}
          </Link>
        ))}
      </nav>

      <div className="relative mt-auto rounded-2xl border border-sidebar-border bg-sidebar-accent/60 p-3">
        <button type="button" onClick={() => setProfileMenu((open) => !open)} className="flex w-full items-center gap-2 text-left">
          <div className="grid size-8 place-items-center rounded-full bg-[#d6eee9] text-xs font-bold text-[#176e64]">{initials(currentUser.name)}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold text-white">{currentUser.name}</div>
            <div className="truncate text-[10px] text-sidebar-foreground/55">{currentUser.role} · {currentUser.branch || 'Oxycare Main Center'}</div>
          </div>
          <MoreHorizontal size={15} className="text-sidebar-foreground/50" />
        </button>
        {profileMenu && <div className="absolute bottom-[calc(100%+8px)] left-0 right-0 overflow-hidden rounded-2xl border border-sidebar-border bg-[#173c4c] p-3 shadow-2xl z-50 animate-in fade-in zoom-in-95">
          <div className="text-xs font-bold text-white">{currentUser.name}</div>
          <div className="mono text-[10px] text-sidebar-foreground/75 mt-0.5">{currentUser.email}</div>
          <div className="mt-2 flex items-center justify-between border-t border-sidebar-border pt-2 text-[11px] text-sidebar-foreground/70">
            <span>Role: <strong className="text-primary">{currentUser.role}</strong></span>
            <span>{currentUser.branch || 'Oxycare Main Center'}</span>
          </div>
          <div className="pt-2 mt-2 border-t border-sidebar-border">
            <button type="button" onClick={() => { setProfileMenu(false); onLogout(); }} className="w-full rounded-xl px-3 py-2 text-center text-xs font-bold text-destructive-foreground bg-destructive/85 hover:bg-destructive transition-colors">
              Log Out of Oxycare LIS
            </button>
          </div>
        </div>}
      </div>
    </aside>
    {mobileNav && <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-foreground/25 md:hidden" onClick={() => setMobileNav(false)} />}
    <div className="sidebar-layout-main flex-1 min-w-0">
      <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-border/70 bg-background/90 px-5 backdrop-blur-md md:px-9">
        <div className="flex items-center gap-3">
          <Button variant="ghost" className="px-2 md:hidden" onClick={() => setMobileNav(true)}><Menu size={20} /></Button>
          <div>
            <div className="mono text-[10px] font-bold uppercase tracking-[.18em] text-muted-foreground">Oxycare / {current}</div>
            <div className="mt-0.5 text-sm font-semibold text-foreground flex items-center gap-2">
              <span>{currentUser.name}</span>
              <span className="mono rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-bold text-primary">{currentUser.role}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
            <MapPin size={13} className="text-primary" /> {currentUser.branch || 'Oxycare Main Center'}
          </span>

          <NotificationCenter currentUser={currentUser} />

          <Button
            variant="secondary"
            onClick={onLogout}
            className="h-9 px-3 text-xs font-semibold gap-1.5 text-destructive hover:bg-destructive/10 border-destructive/20 shadow-sm"
          >
            <XCircle size={14} /> <span className="hidden sm:inline">Log Out</span>
          </Button>
        </div>
      </header>
      <main className="page-enter w-full px-5 py-7 md:px-9">{children}</main>
    </div>
  </div>;
}

function MetricCard({ label, value, detail, icon: Icon, tone = 'teal', trend }: { label: string; value: string | number; detail: string; icon: typeof CalendarDays; tone?: 'teal' | 'amber' | 'blue' | 'coral'; trend?: string }) {
  return <Panel className="rise-in relative overflow-hidden p-5"><div className={cx('absolute right-0 top-0 h-20 w-20 rounded-bl-[50px] opacity-70', tone === 'teal' && 'bg-[#e5f5f1]', tone === 'amber' && 'bg-[#fff2dd]', tone === 'blue' && 'bg-[#e8f0f8]', tone === 'coral' && 'bg-[#fce9e8]')} /><div className="relative flex items-start justify-between"><div><div className="text-xs font-semibold text-muted-foreground">{label}</div><div className="mt-2 text-[29px] font-bold tracking-[-.06em]">{value}</div><div className="mt-1 text-xs text-muted-foreground">{detail}</div></div><div className={cx('grid size-9 place-items-center rounded-xl', tone === 'teal' && 'bg-[#e5f5f1] text-[#167366]', tone === 'amber' && 'bg-[#fff2dd] text-[#a96816]', tone === 'blue' && 'bg-[#e8f0f8] text-[#32607e]', tone === 'coral' && 'bg-[#fce9e8] text-[#b34b48]')}><Icon size={18} /></div></div>{trend && <div className="absolute bottom-4 right-5 flex items-center gap-1 text-[10px] font-semibold text-[#167366]"><ArrowUpRight size={12} />{trend}</div>}</Panel>;
}

// Passbook Financial Ledger Table
function PassbookLedgerTable({ ledgerItems, onShowInfo, role, currentUserRole }: { ledgerItems: LedgerItem[]; onShowInfo?: (item: LedgerItem) => void; role?: string; currentUserRole?: Role }) {
  const showAgentInc = currentUserRole !== 'DOCTOR' && role !== 'DOCTOR';
  return (
    <div className="overflow-x-auto rounded-2xl border border-black bg-white shadow-sm">
      <table className="w-full min-w-[750px] text-left text-sm border-collapse">
        <thead>
          <tr className="border-b-2 border-black bg-[#f2f7f7] text-xs font-bold text-black uppercase tracking-wider">
            <th className="border-r border-black px-4 py-3 text-center w-[110px]">Date</th>
            <th className="border-r border-black px-4 py-3">Particulars & Transaction</th>
            <th className="border-r border-black px-3 py-3 text-right text-[#167366] w-[110px]">Partner Share</th>
            {showAgentInc && <th className="border-r border-black px-3 py-3 text-right text-[#a96816] w-[110px]">Agent Inc.</th>}
            <th className="border-r border-black px-3 py-3 text-right text-[#d94f4f] w-[120px]">Spends*</th>
            <th className="border-r border-black px-3 py-3 text-right text-[#2e9c64] w-[120px]">Deposits**</th>
            <th className="px-4 py-3 text-right w-[130px]">Balance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/80 font-medium">
          {ledgerItems.map((item) => (
            <tr key={item.id} className="hover:bg-[#f9fbfb]">
              <td className="border-r border-black px-4 py-3 text-center text-xs text-black/90 font-mono">
                {item.date}
              </td>
              <td className="border-r border-black px-4 py-3 text-black">
                <div className="font-semibold text-xs leading-relaxed">{item.particulars}</div>
                {item.bookingId && <div className="mono text-[10px] text-black/60 mt-0.5">Booking: {item.bookingId} {item.patientName ? `· ${item.patientName}` : ''}</div>}
              </td>
              <td className="border-r border-black px-3 py-3 text-right font-semibold text-[#167366] text-xs">
                {item.partnerShare ? money(item.partnerShare) : '—'}
              </td>
              {showAgentInc && (
                <td className="border-r border-black px-3 py-3 text-right font-semibold text-[#a96816] text-xs">
                  {item.agentIncentive ? money(item.agentIncentive) : '—'}
                </td>
              )}
              <td className="border-r border-black px-3 py-3 text-right font-semibold text-[#d94f4f] text-xs">
                {item.spends ? `₹ ${item.spends.toLocaleString('en-IN')}` : ''}
              </td>
              <td className="border-r border-black px-3 py-3 text-right font-semibold text-[#2e9c64] text-xs">
                {item.deposits ? `₹ ${item.deposits.toLocaleString('en-IN')}` : ''}
              </td>
              <td className="px-4 py-3 text-right font-bold text-black text-xs">
                <div className="inline-flex items-center justify-end gap-1.5">
                  <span>₹ {item.balance.toLocaleString('en-IN')}</span>
                  {item.hasInfo && (
                    <button
                      onClick={() => onShowInfo?.(item)}
                      title="View transaction breakdown"
                      className="inline-grid size-5 place-items-center rounded-full border border-black/60 text-black hover:bg-black hover:text-white"
                    >
                      <Info size={11} />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Dashboard({ currentUser }: { currentUser: UserAccount }) {
  const summaryQuery = useGetDashboardSummary();
  const activityQuery = useListActivity();
  const appointmentQuery = useListAppointments({ page: 1, pageSize: 50, date: today });
  const summary = summaryQuery.data as DashboardSummary | undefined;
  const allAppointments = (appointmentQuery.data?.items ?? []) as ExtendedAppointment[];
  const activities = (activityQuery.data as Activity[] | undefined) ?? [];

  // Filter appointments specifically for current user identity
  const userAppointments = useMemo(() => {
    if (currentUser.role === 'DOCTOR') {
      return allAppointments.filter((a) =>
        String(a.doctor || a.referredBy || '').toLowerCase().includes(currentUser.name.toLowerCase())
      );
    }
    if (currentUser.role === 'AGENT') {
      return allAppointments.filter((a) =>
        String(a.referredBy || a.createdBy || '').toLowerCase().includes(currentUser.name.toLowerCase())
      );
    }
    return allAppointments;
  }, [allAppointments, currentUser]);

  // Role-specific metrics calculations
  const doctorMetrics = useMemo(() => {
    const totalToday = userAppointments.length;
    const partnerShareEarned = userAppointments.reduce((sum, a) => sum + Number(a.totalPartnerShare || 0), 0);
    const completed = userAppointments.filter((a) => ['Completed', 'Report Ready'].includes(a.status)).length;
    const pendingReports = userAppointments.filter((a) => !['Completed', 'Report Ready', 'Cancelled'].includes(a.status)).length;
    return { totalToday, partnerShareEarned, completed, pendingReports };
  }, [userAppointments]);

  const agentMetrics = useMemo(() => {
    const totalToday = userAppointments.length;
    const incentiveEarned = userAppointments.reduce((sum, a) => sum + Number(a.totalAgentIncentive || 0), 0);
    const confirmed = userAppointments.filter((a) => a.status === 'Confirmed' || a.status === 'Completed').length;
    const inProcess = userAppointments.filter((a) => ['In Process', 'Sample Collected', 'Patient Arrived'].includes(a.status)).length;
    return { totalToday, incentiveEarned, confirmed, inProcess };
  }, [userAppointments]);

  const frontdeskMetrics = useMemo(() => {
    const totalToday = allAppointments.length;
    const collectedToday = allAppointments.reduce((sum, a) => sum + Number(a.advancePayment || 0), 0);
    const homeCollections = allAppointments.filter((a) => a.bookingType === 'Home Collection' || Boolean(a.address)).length;
    const reportReady = allAppointments.filter((a) => a.status === 'Report Ready' || a.reportStatus === 'Ready').length;
    return { totalToday, collectedToday, homeCollections, reportReady };
  }, [allAppointments]);

  const pageMeta = useMemo(() => {
    if (currentUser.role === 'DOCTOR') {
      return {
        eyebrow: `Clinical Practice Console · Dr. ${currentUser.name}`,
        title: "Doctor's Clinical Hub",
        detail: `Personalized view of your patient consultations, test progress, and partner revenue share.`,
      };
    }
    if (currentUser.role === 'AGENT') {
      return {
        eyebrow: `Field Operations & Referrals · ${currentUser.name}`,
        title: "Referral Partner Deck",
        detail: `Live tracking of your referred diagnostic bookings, commission incentives, and report dispatches.`,
      };
    }
    if (currentUser.role === 'FRONTDESK') {
      return {
        eyebrow: `Operations Desk · ${currentUser.branch || 'Indiranagar Branch'}`,
        title: "Frontdesk Counter & Queue",
        detail: "Live monitor of counter check-ins, sample intakes, payment collection, and report dispatches.",
      };
    }
    return {
      eyebrow: "Executive Control Room · Central Diagnostic Command",
      title: "Control Center",
      detail: "A live operational pulse of center-wide patient movement, slot utilization, and consolidated revenues.",
    };
  }, [currentUser]);

  // Compute breakdown and throughput based on user-visible appointments if DOCTOR or AGENT
  const isPersonalized = currentUser.role === 'DOCTOR' || currentUser.role === 'AGENT';
  const displayAppointments = isPersonalized ? userAppointments : allAppointments;

  const statusMix = useMemo(() => {
    if (!isPersonalized) return summary?.statusBreakdown ?? [];
    const counts: Record<string, number> = {};
    for (const a of displayAppointments) {
      counts[a.status] = (counts[a.status] || 0) + 1;
    }
    return Object.entries(counts).map(([label, value]) => ({ label, value }));
  }, [isPersonalized, displayAppointments, summary]);

  const trend = summary?.appointmentTrend ?? [];
  const maxTrend = Math.max(...trend.map((item) => item.value), 1);

  return <>
    <PageTitle
      eyebrow={pageMeta.eyebrow}
      title={pageMeta.title}
      detail={pageMeta.detail}
      action={<Link href="/new-appointment"><Button><Plus size={16} /> New appointment</Button></Link>}
    />

    <QueryState loading={summaryQuery.isLoading} error={!!summaryQuery.error} retry={() => summaryQuery.refetch()}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {currentUser.role === 'DOCTOR' ? (
          <>
            <MetricCard label="My Patients Today" value={doctorMetrics.totalToday} detail="Assigned consultations & tests" icon={UsersRound} tone="teal" trend="+Live" />
            <MetricCard label="Earned Partner Share" value={money(doctorMetrics.partnerShareEarned)} detail="Accrued from today's bookings" icon={CircleDollarSign} tone="amber" />
            <MetricCard label="Completed Procedures" value={doctorMetrics.completed} detail="Patients checked through" icon={CheckCircle2} tone="blue" trend="On track" />
            <MetricCard label="Pending Processing" value={doctorMetrics.pendingReports} detail="Awaiting reports or samples" icon={FileText} tone="coral" />
          </>
        ) : currentUser.role === 'AGENT' ? (
          <>
            <MetricCard label="My Referred Patients" value={agentMetrics.totalToday} detail="Referred bookings today" icon={UsersRound} tone="teal" trend="+Live" />
            <MetricCard label="Agent Incentives" value={money(agentMetrics.incentiveEarned)} detail="Accrued from referred tests" icon={WalletCards} tone="amber" />
            <MetricCard label="Confirmed Referrals" value={agentMetrics.confirmed} detail="Confirmed & processing" icon={CheckCircle2} tone="blue" trend="Active" />
            <MetricCard label="In-Process / Sampling" value={agentMetrics.inProcess} detail="Sample collected / in progress" icon={ActivityIcon} tone="coral" />
          </>
        ) : currentUser.role === 'FRONTDESK' ? (
          <>
            <MetricCard label="Today's Counter Queue" value={frontdeskMetrics.totalToday} detail="Patients booked for today" icon={CalendarDays} tone="teal" trend="Live Queue" />
            <MetricCard label="Counter Collections" value={money(frontdeskMetrics.collectedToday)} detail="Advance & payments collected" icon={CircleDollarSign} tone="amber" />
            <MetricCard label="Home Sample Visits" value={frontdeskMetrics.homeCollections} detail="Phlebotomist home collections" icon={Truck} tone="blue" />
            <MetricCard label="Ready for Delivery" value={frontdeskMetrics.reportReady} detail="Reports ready to hand over" icon={FileText} tone="coral" />
          </>
        ) : (
          <>
            <MetricCard label="Appointments today" value={summary?.todayAppointments ?? '—'} detail={`${summary?.confirmed ?? 0} confirmed · ${summary?.pending ?? 0} pending`} icon={CalendarDays} tone="teal" trend="+8.4% vs last week" />
            <MetricCard label="Collected today" value={summary ? money(summary.revenue) : '—'} detail={`${summary?.pendingPayments ?? 0} payments to reconcile`} icon={CircleDollarSign} tone="amber" />
            <MetricCard label="Completed" value={summary?.completed ?? '—'} detail="Patients checked through" icon={CheckCircle2} tone="blue" trend="On track" />
            <MetricCard label="Reports pending" value={summary?.reportsPending ?? '—'} detail={`${summary?.whatsappSent ?? 0} updates sent on WhatsApp`} icon={FileText} tone="coral" />
          </>
        )}
      </div>
    </QueryState>

    <div className="mt-5 grid gap-5 xl:grid-cols-[1.5fr_1fr]">
      <Panel className="p-5">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="font-semibold">Seven-day throughput</h2>
            <p className="mt-1 text-xs text-muted-foreground">Booked visits across the last seven days</p>
          </div>
          <div className="rounded-lg bg-[#e5f5f1] px-2.5 py-1 text-xs font-semibold text-[#167366]">This week</div>
        </div>
        <div className="flex h-[188px] items-end gap-2 sm:gap-4">
          {trend.length ? trend.map((item, index) => (
            <div key={item.label} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
              <div className="relative flex w-full max-w-10 flex-1 items-end rounded-t-lg bg-muted">
                <div className={cx('w-full rounded-t-lg transition-all', index === trend.length - 1 ? 'bg-primary' : 'bg-[#9ccfc6]')} style={{ height: `${Math.max(10, (item.value / maxTrend) * 100)}%` }}>
                  <span className="absolute -mt-5 w-full text-center text-[10px] font-bold text-muted-foreground">{item.value}</span>
                </div>
              </div>
              <span className="text-[10px] font-medium text-muted-foreground">{item.label}</span>
            </div>
          )) : <div className="flex w-full items-center justify-center text-sm text-muted-foreground">No appointment trend yet</div>}
        </div>
      </Panel>

      <Panel className="p-5">
        <div className="mb-5">
          <h2 className="font-semibold">Status mix</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {isPersonalized ? `Status breakdown of your ${displayAppointments.length} appointments` : "Where today's appointments stand"}
          </p>
        </div>
        <div className="space-y-4">
          {statusMix.length ? statusMix.map((item, index) => (
            <div key={item.label}>
              <div className="mb-1.5 flex justify-between text-xs">
                <span className="font-medium">{titleCase(item.label)}</span>
                <span className="mono text-muted-foreground">{item.value}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className={cx('h-full rounded-full', ['bg-primary', 'bg-[#e8a84d]', 'bg-[#7397b2]', 'bg-[#d47770]'][index % 4])} style={{ width: `${displayAppointments.length ? (item.value / displayAppointments.length) * 100 : 0}%` }} />
              </div>
            </div>
          )) : <div className="py-8 text-center text-sm text-muted-foreground">No status data yet</div>}
        </div>
      </Panel>
    </div>

    <div className="mt-5 grid gap-5 xl:grid-cols-[1.45fr_1fr]">
      <Panel>
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="font-semibold">
              {isPersonalized ? `Your Assigned Appointment Board` : `Today's appointment board`}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {isPersonalized ? `Showing ${displayAppointments.length} patients associated with you` : `The next patients through the frontdesk`}
            </p>
          </div>
          <Link href="/appointments" className="text-xs font-bold text-primary hover:underline">View queue</Link>
        </div>
        <QueryState loading={appointmentQuery.isLoading} error={!!appointmentQuery.error} retry={() => appointmentQuery.refetch()}>
          {displayAppointments.length ? (
            <div className="divide-y divide-border">
              {displayAppointments.slice(0, 6).map((appointment) => (
                <AppointmentRow key={appointment.id} appointment={appointment} compact />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={CalendarDays}
              title={isPersonalized ? "No appointments assigned to you today" : "No appointments on the board"}
              detail={isPersonalized ? "Any bookings assigned or referred by you will appear here." : "The day's schedule will appear here as soon as bookings are made."}
              action={<Link href="/new-appointment"><Button><Plus size={15} /> Add booking</Button></Link>}
            />
          )}
        </QueryState>
      </Panel>

      <Panel>
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-semibold">Recent activity & logs</h2>
          <p className="mt-1 text-xs text-muted-foreground">Live updates from across the workspace</p>
        </div>
        <QueryState loading={activityQuery.isLoading} error={!!activityQuery.error} retry={() => activityQuery.refetch()}>
          {activities.length ? (
            <div className="divide-y divide-border">
              {activities.slice(0, 6).map((activity) => (
                <div key={activity.id} className="flex gap-3 px-5 py-3.5">
                  <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-primary">
                    <ActivityIcon size={15} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold">{activity.title}</div>
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{activity.detail}</div>
                  </div>
                  <span className="mono shrink-0 text-[10px] text-muted-foreground">{activity.time}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={ActivityIcon} title="No activity yet" detail="Operational events will be recorded here." />
          )}
        </QueryState>
      </Panel>
    </div>
  </>;
}

// Appointment Row Component
function AppointmentRow({ appointment, compact = false, onChange, canChangeStatus = true }: { appointment: ExtendedAppointment; compact?: boolean; onChange?: () => void; canChangeStatus?: boolean }) {
  const queryClient = useQueryClient();

  const handleStatusChange = async (newStatus: string, e: React.ChangeEvent<HTMLSelectElement>) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/appointments/${appointment.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Status updated to ${newStatus}`);
      queryClient.invalidateQueries({ queryKey: getListAppointmentsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
      onChange?.();
    } catch {
      toast.error('Could not update status');
    }
  };

  const totalPrice = appointment.totalPrice ?? appointment.amount ?? 0;
  const advancePayment = appointment.advancePayment ?? 0;
  const remainingAmount = appointment.remainingAmount ?? Math.max(0, totalPrice - advancePayment);
  const isHomeColl = appointment.bookingType === 'Home Collection' || Boolean(appointment.address);

  return (
    <div className={cx('flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-muted/40 cursor-pointer', !compact && 'min-w-[1150px]')}>
      <Link href={`/appointments/${appointment.id}`} className="flex flex-1 items-center gap-3 min-w-0">
        <div className={cx('grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold', isHomeColl ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-[#dcefeb] text-[#187367]')}>
          {isHomeColl ? <Truck size={16} /> : initials(appointment.patientName)}
        </div>

        <div className="min-w-[150px] flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold hover:text-primary transition-colors">{appointment.patientName}</span>
            {isHomeColl && (
              <span className="mono rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800 border border-amber-300">
                Home Coll
              </span>
            )}
          </div>
          <div className="mono mt-0.5 text-[10px] text-muted-foreground">{appointment.uhid} · {appointment.mobile}</div>
        </div>

        <div className="w-[150px] shrink-0">
          <div className="text-xs font-medium truncate">{appointment.testName}</div>
          <div className="mt-0.5 text-[10px] text-muted-foreground truncate" title={appointment.partnerLabName || appointment.lab}>
            {appointment.partnerLabName ? `🏥 ${appointment.partnerLabName}` : (appointment.items?.length ? `${appointment.items.length} tests included` : (appointment.lab || appointment.branch))}
          </div>
        </div>

        <div className="w-[130px] shrink-0 text-xs">
          <div><span className="text-muted-foreground">Source:</span> <span className="font-semibold">{appointment.source || 'Direct'}</span></div>
          <div className="mt-0.5 truncate text-[10px] text-muted-foreground">Ref: {appointment.referredBy || appointment.doctor || 'Direct'}</div>
        </div>

        <div className="w-[120px] shrink-0 text-xs">
          <div className="mono font-bold text-foreground">{money(totalPrice)}</div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">Adv: {money(advancePayment)}</div>
          <div className="mt-1">
            <span className={cx(
              'mono inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-bold border',
              appointment.paymentCollectedBy === 'Partner'
                ? 'bg-[#e5f5f1] text-[#167366] border-[#167366]/30'
                : 'bg-primary/10 text-primary border-primary/20'
            )}>
              {appointment.paymentCollectedBy === 'Partner' ? 'Partner Coll.' : 'Oxycare Coll.'}
            </span>
          </div>
        </div>

        <div className="w-[110px] shrink-0">
          <span className={cx('mono inline-block rounded-lg px-2 py-0.5 text-xs font-bold', remainingAmount > 0 ? 'bg-[#fff2dd] text-[#a96816]' : 'bg-[#e5f5f1] text-[#167366]')}>
            {remainingAmount > 0 ? `Rem: ${money(remainingAmount)}` : 'Fully Paid'}
          </span>
        </div>
      </Link>

      <div className="w-[130px] shrink-0" onClick={(e) => e.stopPropagation()}>
        {canChangeStatus ? (
        <select
          value={appointment.status}
          onChange={(e) => handleStatusChange(e.target.value, e)}
          className={cx('h-8 w-full rounded-lg border px-2 text-xs font-bold outline-none', statusTone(appointment.status))}
        >
          <option value="Scheduled">Scheduled</option>
          <option value="Confirmed">Confirmed</option>
          <option value="Patient Arrived">Patient Arrived</option>
          <option value="Sample Collected">Sample Collected</option>
          <option value="In Process">In Process</option>
          <option value="Report Ready">Report Ready</option>
          <option value="Completed">Completed</option>
          <option value="Pending Payment">Pending Payment</option>
          <option value="Cancelled">Cancelled</option>
        </select>
        ) : (
          <span className={cx('inline-flex h-8 w-full items-center rounded-lg border px-2 text-xs font-bold', statusTone(appointment.status))}>
            {titleCase(appointment.status)}
          </span>
        )}
      </div>

      {!compact && (
        <Link href={`/appointments/${appointment.id}`} className="shrink-0">
          <button title="Open Full Detail Page" className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-card px-2.5 text-xs font-semibold hover:bg-muted hover:text-primary">
            <Eye size={14} /> Open
          </button>
        </Link>
      )}
    </div>
  );
}

// Full Dedicated Page for Appointment Details (`/appointments/:id`)
function AppointmentDetailPage({ params, currentUser }: { params: { id: string }; currentUser?: UserAccount }) {
  const [location, navigate] = useLocation();
  const [apt, setApt] = useState<ExtendedAppointment | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingDoc, setUploadingDoc] = useState<'prescription' | 'invoice' | 'report' | null>(null);
  const [fileName, setFileName] = useState('');
  const [viewingParams, setViewingParams] = useState<{ testName: string; testCode?: string; parameters: TestParameter[] } | null>(null);

  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [totalPrice, setTotalPrice] = useState('0');
  const [advancePayment, setAdvancePayment] = useState('0');
  const [referredBy, setReferredBy] = useState('');
  const [source, setSource] = useState('Direct');
  const [notes, setNotes] = useState('');

  const loadAppointment = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/appointments/${params.id}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setApt(data);
      setDate(data.date || '');
      setTime(data.time || '');
      setTotalPrice(String(data.totalPrice ?? data.amount ?? 0));
      setAdvancePayment(String(data.advancePayment ?? 0));
      setReferredBy(data.referredBy || data.doctor || '');
      setSource(data.source || 'Direct');
      setNotes(data.notes || '');
    } catch {
      toast.error('Failed to load appointment details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAppointment(); }, [params.id]);

  const handleUpdate = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/appointments/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          time,
          totalPrice: Number(totalPrice),
          advancePayment: Number(advancePayment),
          referredBy,
          source,
          notes,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success('Appointment details saved successfully!');
      loadAppointment();
    } catch {
      toast.error('Could not save appointment details');
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      const res = await fetch(`/api/appointments/${params.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Status updated to ${newStatus}`);
      loadAppointment();
    } catch {
      toast.error('Failed to update status');
    }
  };

  const handleUploadDoc = async (e: FormEvent) => {
    e.preventDefault();
    if (!uploadingDoc) return;
    try {
      const res = await fetch(`/api/appointments/${params.id}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentType: uploadingDoc,
          fileName: fileName || `${uploadingDoc}_${params.id}.pdf`,
          fileUrl: `https://example.com/docs/${params.id}-${uploadingDoc}.pdf`,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${titleCase(uploadingDoc)} attached successfully! Status updated.`);
      setUploadingDoc(null);
      setFileName('');
      loadAppointment();
    } catch {
      toast.error('Document upload failed');
    }
  };

  if (loading || !apt) {
    return <div className="space-y-4 p-6">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-20 rounded-2xl" />)}</div>;
  }

  const remaining = Math.max(0, Number(totalPrice) - Number(advancePayment));

  const timelineSteps = [
    { label: 'Booking Created', key: 'Scheduled', icon: CalendarDays },
    { label: 'Confirmed / Paid', key: 'Confirmed', icon: CheckCircle2 },
    { label: 'Sample Collected', key: 'Sample Collected', icon: FlaskConical },
    { label: 'In Process', key: 'In Process', icon: Clock },
    { label: 'Report Ready', key: 'Report Ready', icon: FileText },
    { label: 'Completed', key: 'Completed', icon: Check },
  ];

  const currentStepIdx = timelineSteps.findIndex((s) => s.key.toLowerCase() === apt.status.toLowerCase());
  const isHomeColl = apt.bookingType === 'Home Collection' || Boolean(apt.address);
  const isDoctor = currentUser?.role === 'DOCTOR';

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <Link href="/appointments">
          <Button variant="secondary" className="gap-1.5"><ArrowLeft size={16} /> Back to Appointments Queue</Button>
        </Link>
        <div className="flex items-center gap-3">
          {isHomeColl && (
            <span className="mono flex items-center gap-1 rounded-xl bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800 border border-amber-300">
              <Truck size={14} /> Home Collection Booking
            </span>
          )}
          <span className="mono text-xs text-muted-foreground">ID: {apt.id}</span>
          <span className={cx('rounded-xl px-3 py-1 text-xs font-bold', statusTone(apt.status))}>{titleCase(apt.status)}</span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Column */}
        <div className="space-y-6 lg:col-span-2">
          {/* Header Card */}
          <Panel className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <span className="mono text-xs font-bold text-primary uppercase tracking-widest">Patient Profile</span>
                <h1 className="text-2xl font-bold text-foreground mt-1">{apt.patientName}</h1>
                <div className="mono text-xs text-muted-foreground mt-1">{apt.uhid} · {apt.mobile}</div>
              </div>
              <div className="text-right">
                <div className="text-xs font-semibold text-muted-foreground">Test Investigation</div>
                <div className="text-lg font-bold text-primary">{apt.testName}</div>
                <div className="text-xs font-semibold text-foreground mt-0.5">{apt.partnerLabName ? `Partner Lab: ${apt.partnerLabName}` : (apt.lab || apt.branch)}</div>
                {apt.partnerLabAddress && <div className="text-[11px] text-muted-foreground">{apt.partnerLabAddress}</div>}
              </div>
            </div>

            {/* Home Collection Details Card if applicable */}
            {isHomeColl && (
              <div className="mt-5 rounded-2xl border border-amber-300 bg-amber-500/10 p-4 text-amber-900">
                <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-amber-800">
                  <MapPin size={15} /> Home Collection Details
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 text-xs">
                  <div><span className="font-semibold text-amber-700">Collection Date:</span> {formatDay(apt.collectionDate || apt.date)}</div>
                  <div><span className="font-semibold text-amber-700">Time Slot:</span> {apt.timeSlot || apt.time}</div>
                  <div className="sm:col-span-2"><span className="font-semibold text-amber-700">Full Address:</span> {apt.address || 'Address recorded on file'}</div>
                  <div><span className="font-semibold text-amber-700">PIN Code:</span> {apt.pinCode || '560034'}</div>
                </div>
              </div>
            )}

            {/* Included Multi-Tests Table / Cart Breakdown */}
            {apt.items && apt.items.length > 0 && (
              <div className="mt-6 border-t border-border pt-4">
                <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Selected Tests & Parameters Breakdown</div>
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted/45 text-[10px] uppercase font-bold text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Test Code & Name</th>
                        <th className="px-3 py-2">Patient Preparation Instructions</th>
                        <th className="px-3 py-2 text-right">Price</th>
                        <th className="px-3 py-2 text-right">Partner Share</th>
                        {!isDoctor && <th className="px-3 py-2 text-right">Agent Inc.</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {apt.items.map((it, idx) => (
                        <tr key={idx} className="hover:bg-muted/20">
                          <td className="px-3 py-2 font-semibold">
                            <div>{it.testName} <span className="mono text-[10px] text-muted-foreground">({it.testCode})</span></div>
                            {it.parameters && it.parameters.length > 0 ? (
                              <button
                                type="button"
                                onClick={() => setViewingParams({ testName: it.testName, testCode: it.testCode, parameters: it.parameters || [] })}
                                className="inline-flex items-center gap-1 mt-1 rounded bg-primary/10 hover:bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary transition-colors"
                              >
                                <FlaskConical size={11} /> {it.parameters.length} Parameters (Inspect)
                              </button>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground italic">
                            {it.instructions || 'No special preparation'}
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-foreground">{money(it.price)}</td>
                          <td className="px-3 py-2 text-right font-semibold text-[#167366]">{money(it.partnerShare || 0)}</td>
                          {!isDoctor && (
                            <td className="px-3 py-2 text-right font-semibold text-[#a96816]">{money(it.agentIncentive || 0)}</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Interactive Timeline Progress Bar */}
            <div className="mt-8 border-t border-border pt-6">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">Operational Lifecycle Timeline</div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {timelineSteps.map((step, idx) => {
                  const active = idx <= currentStepIdx || apt.status === 'Completed';
                  const StepIcon = step.icon;
                  return (
                    <button
                      key={step.key}
                      onClick={() => handleStatusChange(step.key)}
                      className={cx(
                        'flex flex-col items-center rounded-xl p-2.5 text-center transition-all border',
                        active ? 'border-primary bg-primary/10 text-primary font-bold' : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted'
                      )}
                    >
                      <StepIcon size={18} />
                      <span className="mt-1.5 text-[10px] leading-tight">{step.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </Panel>

          {/* Document Hub Card */}
          <Panel className="p-6">
            <h2 className="text-lg font-bold mb-4">Document Hub & Uploads</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-border p-4 text-center">
                <FileText className="mx-auto text-primary" size={26} />
                <div className="font-semibold text-xs mt-2">Doctor Prescription</div>
                {apt.prescriptionUrl ? (
                  <div className="mt-3 space-y-1">
                    <span className="mono rounded bg-[#e5f5f1] px-2 py-0.5 text-[10px] font-bold text-[#167366]">Attached</span>
                    <a href={apt.prescriptionUrl} target="_blank" rel="noreferrer" className="block text-xs font-bold text-primary hover:underline">View File</a>
                  </div>
                ) : (
                  <Button variant="secondary" className="mt-3 w-full text-xs h-8" onClick={() => setUploadingDoc('prescription')}>
                    <Upload size={13} /> Attach Rx
                  </Button>
                )}
              </div>

              <div className="rounded-2xl border border-border p-4 text-center">
                <ReceiptText className="mx-auto text-amber-600" size={26} />
                <div className="font-semibold text-xs mt-2">Billing Invoice</div>
                {apt.invoiceUrl ? (
                  <div className="mt-3 space-y-1">
                    <span className="mono rounded bg-[#e5f5f1] px-2 py-0.5 text-[10px] font-bold text-[#167366]">Attached</span>
                    <a href={apt.invoiceUrl} target="_blank" rel="noreferrer" className="block text-xs font-bold text-primary hover:underline">View Invoice</a>
                  </div>
                ) : (
                  <Button variant="secondary" className="mt-3 w-full text-xs h-8" onClick={() => setUploadingDoc('invoice')}>
                    <Upload size={13} /> Upload Invoice
                  </Button>
                )}
              </div>

              <div className="rounded-2xl border border-border p-4 text-center">
                <FileCheck className="mx-auto text-emerald-600" size={26} />
                <div className="font-semibold text-xs mt-2">Patient Lab Report</div>
                {apt.reportUrl ? (
                  <div className="mt-3 space-y-1">
                    <span className="mono rounded bg-[#e5f5f1] px-2 py-0.5 text-[10px] font-bold text-[#167366]">Report Uploaded</span>
                    <a href={apt.reportUrl} target="_blank" rel="noreferrer" className="block text-xs font-bold text-primary hover:underline">Download Report</a>
                  </div>
                ) : (
                  <Button variant="secondary" className="mt-3 w-full text-xs h-8" onClick={() => setUploadingDoc('report')}>
                    <Upload size={13} /> Upload Report
                  </Button>
                )}
              </div>
            </div>
          </Panel>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          <Panel className="p-6">
            <h2 className="text-lg font-bold mb-4">Edit Appointment Info</h2>
            <form onSubmit={handleUpdate} className="space-y-4">
              <Field label="Appointment Date">
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="Appointment Time">
                <Input value={time} onChange={(e) => setTime(e.target.value)} />
              </Field>
              <Field label="Total Price (₹)">
                <Input type="number" value={totalPrice} onChange={(e) => setTotalPrice(e.target.value)} />
              </Field>
              <Field label="Advance Payment (₹)">
                <Input type="number" value={advancePayment} onChange={(e) => setAdvancePayment(e.target.value)} />
              </Field>

              {/* Financial Snapshot Summary */}
              <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Payment Collection:</span>
                  <span className={cx(
                    'font-bold px-2 py-0.5 rounded text-[10px] border',
                    apt.paymentCollectedBy === 'Partner'
                      ? 'bg-[#e5f5f1] text-[#167366] border-[#167366]/30'
                      : 'bg-primary/10 text-primary border-primary/20'
                  )}>
                    {apt.paymentCollectedBy === 'Partner' ? 'Collected by Partner' : 'Collected by Oxycare (Owner)'}
                  </span>
                </div>
                <div className="flex justify-between"><span>Remaining Due:</span> <span className="font-bold text-amber-700">{money(remaining)}</span></div>
                <div className="flex justify-between border-t border-border pt-1.5">
                  <span>{isDoctor ? 'Your Doctor Partner Share:' : 'Total Partner Share:'}</span>
                  <span className="font-bold text-[#167366]">{money(apt.totalPartnerShare || 0)}</span>
                </div>
                {!isDoctor && (
                  <div className="flex justify-between">
                    <span>Total Agent Incentive:</span>
                    <span className="font-bold text-[#a96816]">{money(apt.totalAgentIncentive || 0)}</span>
                  </div>
                )}
              </div>

              <Field label="Referring Doctor / Agent">
                <Input value={referredBy} onChange={(e) => setReferredBy(e.target.value)} />
              </Field>
              <Field label="Notes">
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
              <Button type="submit" className="w-full">Save Changes</Button>
            </form>
          </Panel>
        </div>
      </div>

      {/* Test Parameters Inspect Modal */}
      <ModalPortal isOpen={!!viewingParams} onClose={() => setViewingParams(null)} maxWidth="max-w-lg">
        {viewingParams && (
          <>
            <div className="flex shrink-0 items-center justify-between border-b border-border p-5 pb-3 bg-card">
              <div>
                <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                  <FlaskConical size={18} className="text-primary" />
                  <span>Test Parameters Checklist</span>
                  <span className="mono rounded bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                    {viewingParams.parameters.length} parameters
                  </span>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {viewingParams.testName} {viewingParams.testCode ? `· ${viewingParams.testCode}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingParams(null)}
                className="grid size-8 place-items-center rounded-xl hover:bg-muted text-muted-foreground"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 scrollbar-thin">
              {viewingParams.parameters.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                  No individual sub-parameters recorded for this diagnostic test.
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-border">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted/60 text-[10px] uppercase font-bold text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2.5">Investigation Parameter</th>
                        <th className="px-3 py-2.5">Unit</th>
                        <th className="px-3 py-2.5">Reference Normal Range</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {viewingParams.parameters.map((param, idx) => (
                        <tr key={idx} className="hover:bg-muted/30">
                          <td className="px-3 py-2.5 font-semibold text-foreground">{param.name}</td>
                          <td className="px-3 py-2.5 text-muted-foreground font-mono">{param.unit || '—'}</td>
                          <td className="px-3 py-2.5 text-emerald-700 font-semibold font-mono">{param.normalRange || 'Standard'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex shrink-0 justify-end p-4 border-t border-border bg-muted/20">
              <Button type="button" onClick={() => setViewingParams(null)}>Close</Button>
            </div>
          </>
        )}
      </ModalPortal>

      {/* Upload Doc Modal */}
      <ModalPortal isOpen={!!uploadingDoc} onClose={() => setUploadingDoc(null)} maxWidth="max-w-md">
        <div className="flex shrink-0 items-center justify-between border-b border-border p-5 pb-3 bg-card">
          <h3 className="text-lg font-bold">Attach {uploadingDoc ? titleCase(uploadingDoc) : ''} Document</h3>
          <button onClick={() => setUploadingDoc(null)} className="grid size-8 place-items-center rounded-xl hover:bg-muted text-muted-foreground"><X size={16} /></button>
        </div>
        <form onSubmit={handleUploadDoc} className="flex flex-col min-h-0 flex-1 overflow-hidden">
          <div className="p-5 flex-1 overflow-y-auto">
            <Field label="File Name / Reference">
              <Input value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder={`${uploadingDoc}_${apt.id}.pdf`} />
            </Field>
          </div>
          <div className="flex shrink-0 justify-end gap-2 p-4 border-t border-border bg-muted/20">
            <Button type="button" variant="secondary" onClick={() => setUploadingDoc(null)}>Cancel</Button>
            <Button type="submit">Upload & Confirm</Button>
          </div>
        </form>
      </ModalPortal>
    </>
  );
}

// Appointments Main Queue Page (with Dynamic Search & Home Collection Filter)
function Appointments({ currentUser }: { currentUser: UserAccount }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [bookingType, setBookingType] = useState('All Visit Types');
  const [date, setDate] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [testFilter, setTestFilter] = useState('all');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [page, setPage] = useState(1);

  // Fetch unique test names for filter dropdown
  const [testNames, setTestNames] = useState<string[]>([]);
  useEffect(() => {
    fetch('/api/tests').then((r) => r.json()).then((tests: any[]) => {
      const names = [...new Set(tests.map((t: any) => t.name).filter(Boolean))];
      setTestNames(names);
    }).catch(() => {});
  }, []);

  const queryClient = useQueryClient();
  const params = useMemo(() => ({
    page,
    pageSize: 50,
    search: search || undefined,
    status: status === 'all' ? undefined : status,
    date: date || undefined,
  }), [page, search, status, date]);
  const query = useListAppointments(params);

  const allItems = (query.data?.items ?? []) as ExtendedAppointment[];

  const items = useMemo(() => {
    let list = allItems;
    if (currentUser.role === 'DOCTOR') {
      list = list.filter((a) => String(a.doctor || a.referredBy || '').toLowerCase().includes(currentUser.name.toLowerCase()));
    } else if (currentUser.role === 'AGENT') {
      list = list.filter((a) => String(a.referredBy || a.createdBy || '').toLowerCase().includes(currentUser.name.toLowerCase()));
    }
    if (bookingType !== 'All Visit Types') {
      list = list.filter((a) => String(a.bookingType || 'Lab Visit').toLowerCase() === String(bookingType).toLowerCase());
    }
    if (fromDate) list = list.filter((a) => a.date >= fromDate);
    if (toDate) list = list.filter((a) => a.date <= toDate);
    if (paymentFilter !== 'all') list = list.filter((a) => String(a.paymentStatus || '').toLowerCase() === paymentFilter.toLowerCase());
    if (testFilter !== 'all') list = list.filter((a) => String(a.testName || '').toLowerCase().includes(testFilter.toLowerCase()));
    return list;
  }, [allItems, currentUser, bookingType, fromDate, toDate, paymentFilter, testFilter]);

  const totalPages = Math.max(1, Math.ceil(items.length / 50));

  const roleLabel = currentUser.role === 'DOCTOR'
    ? `Showing only your assigned appointments (${currentUser.name})`
    : currentUser.role === 'AGENT'
    ? `Showing only your referred appointments (${currentUser.name})`
    : null;

  const refreshData = () => {
    queryClient.invalidateQueries({ queryKey: getListAppointmentsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
  };

  const canChangeStatus = currentUser.role === 'ADMIN' || currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'FRONTDESK' || (currentUser.permissions || []).includes('change_status');

  const activeFilterCount = [
    status !== 'all',
    bookingType !== 'All Visit Types',
    date, fromDate, toDate,
    paymentFilter !== 'all',
    testFilter !== 'all',
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setSearch(''); setStatus('all'); setBookingType('All Visit Types');
    setDate(''); setFromDate(''); setToDate('');
    setPaymentFilter('all'); setTestFilter('all');
    setPage(1);
  };

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (status !== 'all') params.set('status', status);
      if (date) params.set('date', date);
      if (fromDate) params.set('fromDate', fromDate);
      if (toDate) params.set('toDate', toDate);
      if (paymentFilter !== 'all') params.set('paymentStatus', paymentFilter);
      if (testFilter !== 'all') params.set('testName', testFilter);
      if (bookingType !== 'All Visit Types') params.set('bookingType', bookingType);

      const res = await fetch(`/api/appointments/export-csv?${params.toString()}`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `appointments_export_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Exported ${items.length} appointments to CSV`);
    } catch {
      toast.error('Failed to export CSV');
    } finally {
      setExporting(false);
    }
  };

  return <>
    <PageTitle
      eyebrow="Operations / Queue"
      title="Appointments Queue"
      detail={roleLabel || 'Dynamic search across patients, UHID, mobile, booking IDs, address, and PIN codes.'}
      action={
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={handleExportCSV} disabled={exporting} className="gap-1.5">
            <Download size={14} /> {exporting ? 'Exporting...' : 'Export CSV'}
          </Button>
          <Link href="/new-appointment"><Button><Plus size={16} /> New appointment</Button></Link>
        </div>
      }
    />
    {roleLabel && (
      <div className="mb-4 flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-xs font-semibold text-primary">
        <Shield size={14} /> {roleLabel}
      </div>
    )}
    <Panel>
      {/* Primary Filter Row */}
      <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search patient name, UHID, mobile, booking ID, PIN code, address..." className="pl-9" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="w-[155px]">
            <option value="all">All Statuses</option>
            <option value="Confirmed">Confirmed</option>
            <option value="Pending Payment">Pending Payment</option>
            <option value="In Process">In Process</option>
            <option value="Report Ready">Report Ready</option>
            <option value="Completed">Completed</option>
            <option value="Cancelled">Cancelled</option>
          </Select>
          <Input type="date" value={date} onChange={(event) => { setDate(event.target.value); setPage(1); }} className="w-[145px]" />
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={cx(
              'inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition-colors',
              showAdvanced || activeFilterCount > 0
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-card text-muted-foreground hover:bg-muted'
            )}
          >
            <SlidersHorizontal size={13} /> Filters
            {activeFilterCount > 0 && (
              <span className="grid size-4 place-items-center rounded-full bg-primary text-[9px] text-primary-foreground font-bold">{activeFilterCount}</span>
            )}
          </button>
          <Button variant="secondary" className="px-3" onClick={clearAllFilters}><RefreshCw size={15} /></Button>
        </div>
      </div>

      {/* Advanced Filters Expandable Row */}
      {showAdvanced && (
        <div className="flex flex-wrap items-end gap-3 border-b border-border bg-muted/20 px-4 py-3">
          <Field label="From Date">
            <Input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} className="w-[140px]" />
          </Field>
          <Field label="To Date">
            <Input type="date" value={toDate} min={fromDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }} className="w-[140px]" />
          </Field>
          <Field label="Visit Type">
            <Select value={bookingType} onChange={(e) => { setBookingType(e.target.value); setPage(1); }} className="w-[145px]">
              <option value="All Visit Types">All Types</option>
              <option value="Lab Visit">Lab Visit</option>
              <option value="Home Collection">Home Collection</option>
            </Select>
          </Field>
          <Field label="Payment Status">
            <Select value={paymentFilter} onChange={(e) => { setPaymentFilter(e.target.value); setPage(1); }} className="w-[140px]">
              <option value="all">All Payments</option>
              <option value="Paid">Paid</option>
              <option value="Partial">Partial</option>
              <option value="Pending">Pending</option>
            </Select>
          </Field>
          <Field label="Test / Investigation">
            <Select value={testFilter} onChange={(e) => { setTestFilter(e.target.value); setPage(1); }} className="w-[180px]">
              <option value="all">All Tests</option>
              {testNames.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Field>
          {activeFilterCount > 0 && (
            <button type="button" onClick={clearAllFilters} className="text-xs font-semibold text-destructive hover:underline mb-1.5">
              Clear All Filters
            </button>
          )}
        </div>
      )}

      <div className="hidden overflow-x-auto lg:block">
        <div className="flex min-w-[1150px] items-center gap-3 border-b border-border bg-muted/45 px-5 py-3 text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">
          <span className="w-9" />
          <span className="min-w-[150px] flex-1">Patient</span>
          <span className="w-[150px]">Investigation</span>
          <span className="w-[130px]">Source & Ref</span>
          <span className="w-[120px]">Total & Adv</span>
          <span className="w-[110px]">Remaining</span>
          <span className="w-[130px]">Inline Status</span>
          <span className="w-[80px]">Actions</span>
        </div>
        <QueryState loading={query.isLoading} error={!!query.error} retry={() => query.refetch()}>
          {items.length ? items.map((appointment) => <AppointmentRow appointment={appointment} key={appointment.id} onChange={refreshData} canChangeStatus={canChangeStatus} />) : <EmptyState icon={CalendarDays} title="No appointments match search" detail={currentUser.role === 'DOCTOR' ? 'No appointments assigned to you.' : 'Try a wider search or clear filters.'} />}
        </QueryState>
      </div>
      <div className="flex items-center justify-between border-t border-border px-5 py-3">
        <span className="text-xs text-muted-foreground">{items.length} appointments · page {page} of {totalPages}</span>
        <div className="flex gap-1">
          <Button variant="ghost" className="size-8 px-0" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}><ChevronLeft size={16} /></Button>
          <Button variant="ghost" className="size-8 px-0" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}><ChevronRight size={16} /></Button>
        </div>
      </div>
    </Panel>
  </>;
}


// Slots & Capacity Scheduling Manager
function SlotsManager() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [slotMode, setSlotMode] = useState<'single' | 'multiday'>('single');

  // Single slot state
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedLab, setSelectedLab] = useState('Central Lab');
  const [testName, setTestName] = useState('PET CT Scan');
  const [startTime, setStartTime] = useState('09:00 AM');
  const [endTime, setEndTime] = useState('09:45 AM');
  const [capacity, setCapacity] = useState('3');

  // Multi-day range state
  const [rangeStartDate, setRangeStartDate] = useState(today);
  const [rangeEndDate, setRangeEndDate] = useState(today);
  const [rangeLab, setRangeLab] = useState('Central Lab');
  const [rangeTestName, setRangeTestName] = useState('PET CT Scan');
  const [rangeStartTime, setRangeStartTime] = useState('09:00 AM');
  const [rangeEndTime, setRangeEndTime] = useState('09:45 AM');
  const [rangeCapacity, setRangeCapacity] = useState('5');
  const [skipDays, setSkipDays] = useState<string[]>([]);
  const [generatingBulk, setGeneratingBulk] = useState(false);

  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const loadSlots = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/slots');
      setSlots(await res.json());
    } catch {
      toast.error('Failed to load slots');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSlots(); }, []);

  const totalDaysInRange = useMemo(() => {
    const s = new Date(rangeStartDate);
    const e = new Date(rangeEndDate);
    let count = 0;
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      const dayName = DAY_NAMES[d.getDay()];
      if (!skipDays.includes(dayName)) count++;
    }
    return count;
  }, [rangeStartDate, rangeEndDate, skipDays]);

  const handleCreateSlot = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
          startTime,
          endTime,
          capacity: Number(capacity),
          lab: selectedLab,
          testName,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success('New slot created successfully!');
      setShowAdd(false);
      loadSlots();
    } catch {
      toast.error('Failed to create slot');
    }
  };

  const handleCreateMultiDaySlots = async (e: FormEvent) => {
    e.preventDefault();
    if (rangeEndDate < rangeStartDate) { toast.error('End date must be on or after start date'); return; }
    setGeneratingBulk(true);
    try {
      const skipSet = new Set(skipDays);
      const days = skipSet.size > 0 ? DAY_NAMES.filter((d) => !skipSet.has(d)) : [];
      const res = await fetch('/api/slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: rangeStartDate,
          endDate: rangeEndDate,
          days,
          startTime: rangeStartTime,
          endTime: rangeEndTime,
          capacity: Number(rangeCapacity),
          lab: rangeLab,
          testName: rangeTestName,
        }),
      });
      if (!res.ok) throw new Error();
      const created: any[] = await res.json();
      toast.success(`✅ ${created.length} slots generated across ${totalDaysInRange} days!`);
      setShowAdd(false);
      loadSlots();
    } catch {
      toast.error('Failed to generate bulk slots');
    } finally {
      setGeneratingBulk(false);
    }
  };

  const toggleSkipDay = (day: string) => {
    setSkipDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]);
  };

  return (
    <>
      <PageTitle
        eyebrow="Capacity Management"
        title="Slots & Resource Scheduling"
        detail="Create, inspect, and manage time slot capacities for diagnostic investigations."
        action={<Button onClick={() => setShowAdd(true)}><Plus size={16} /> Create Time Slot</Button>}
      />
      <Panel className="p-6">
        {loading ? (
          <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {slots.map((slot) => (
              <div key={slot.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="font-bold text-sm text-foreground">{slot.testName}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{slot.date} · {slot.startTime} - {slot.endTime}</div>
                <div className="text-xs font-semibold text-primary mt-1">{slot.lab}</div>
                <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                  <span className={cx('rounded-lg px-2.5 py-0.5 text-[10px] font-bold', statusTone(slot.status))}>{slot.status}</span>
                  <span className="mono text-xs font-bold">{slot.booked} / {slot.capacity} Booked</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <ModalPortal isOpen={showAdd} onClose={() => setShowAdd(false)} maxWidth="max-w-lg">
        <div className="flex shrink-0 items-center justify-between border-b border-border p-6 pb-4 bg-card">
          <div>
            <div className="mono text-[10px] font-bold uppercase tracking-[.18em] text-primary">Slots Engine</div>
            <h2 className="text-xl font-bold">Create Appointment Slots</h2>
          </div>
          <button onClick={() => setShowAdd(false)} className="grid size-8 place-items-center rounded-full hover:bg-muted text-muted-foreground"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
          {/* Tab Toggle */}
          <div className="flex mb-4 rounded-xl border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setSlotMode('single')}
              className={cx('flex-1 py-2.5 text-xs font-bold transition-colors', slotMode === 'single' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted')}
            >
              📅 Single Day Slot
            </button>
            <button
              type="button"
              onClick={() => setSlotMode('multiday')}
              className={cx('flex-1 py-2.5 text-xs font-bold transition-colors', slotMode === 'multiday' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted')}
            >
              🗓️ Multi-Day Date Range
            </button>
          </div>

          {slotMode === 'single' ? (
            <form onSubmit={handleCreateSlot} className="space-y-4">
              <Field label="Slot Date"><Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} /></Field>
              <Field label="Diagnostic Lab">
                <Select value={selectedLab} onChange={(e) => setSelectedLab(e.target.value)}>
                  <option value="Central Lab">Central Pathology Lab</option>
                  <option value="Radiology">Radiology & Imaging Lab</option>
                  <option value="Nuclear Medicine">Nuclear Medicine Lab</option>
                </Select>
              </Field>
              <Field label="Test / Investigation Name">
                <Input value={testName} onChange={(e) => setTestName(e.target.value)} placeholder="e.g. PET CT Scan, MRI Brain" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Start Time"><Input value={startTime} onChange={(e) => setStartTime(e.target.value)} placeholder="09:00 AM" /></Field>
                <Field label="End Time"><Input value={endTime} onChange={(e) => setEndTime(e.target.value)} placeholder="09:45 AM" /></Field>
              </div>
              <Field label="Slot Capacity (Patients)"><Input type="number" min="1" max="50" value={capacity} onChange={(e) => setCapacity(e.target.value)} /></Field>
              <div className="flex justify-end gap-2 pt-4 border-t border-border">
                <Button type="button" variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
                <Button type="submit">Create Slot</Button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleCreateMultiDaySlots} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Start Date *"><Input type="date" value={rangeStartDate} onChange={(e) => setRangeStartDate(e.target.value)} required /></Field>
                <Field label="End Date *"><Input type="date" value={rangeEndDate} onChange={(e) => setRangeEndDate(e.target.value)} min={rangeStartDate} required /></Field>
              </div>

              {/* Day Skip Selector */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Skip Days of Week (e.g. Sundays)</label>
                <div className="flex flex-wrap gap-1.5">
                  {DAY_NAMES.map((day) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleSkipDay(day)}
                      className={cx(
                        'rounded-lg px-3 py-1 text-xs font-bold border transition-colors',
                        skipDays.includes(day) ? 'bg-destructive/10 border-destructive/40 text-destructive' : 'bg-muted border-border text-foreground'
                      )}
                    >
                      {day}
                    </button>
                  ))}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1.5">
                  {skipDays.length > 0 ? `Skipping: ${skipDays.join(', ')}` : 'All days will get slots'}
                  {rangeEndDate >= rangeStartDate && ` · ${totalDaysInRange} day(s) will receive slots`}
                </div>
              </div>

              <Field label="Diagnostic Lab">
                <Select value={rangeLab} onChange={(e) => setRangeLab(e.target.value)}>
                  <option value="Central Lab">Central Pathology Lab</option>
                  <option value="Radiology">Radiology & Imaging Lab</option>
                  <option value="Nuclear Medicine">Nuclear Medicine Lab</option>
                </Select>
              </Field>
              <Field label="Test / Investigation Name">
                <Input value={rangeTestName} onChange={(e) => setRangeTestName(e.target.value)} placeholder="e.g. PET CT Scan, MRI Brain" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Slot Start Time"><Input value={rangeStartTime} onChange={(e) => setRangeStartTime(e.target.value)} placeholder="09:00 AM" /></Field>
                <Field label="Slot End Time"><Input value={rangeEndTime} onChange={(e) => setRangeEndTime(e.target.value)} placeholder="09:45 AM" /></Field>
              </div>
              <Field label="Capacity Per Day Slot">
                <Input type="number" value={rangeCapacity} onChange={(e) => setRangeCapacity(e.target.value)} min="1" />
              </Field>

              {totalDaysInRange > 0 && (
                <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-xs">
                  <span className="font-bold text-foreground">Preview: </span>
                  <span className="text-muted-foreground">Will generate <span className="font-bold text-primary">{totalDaysInRange} slots</span> · {rangeTestName} · {rangeLab} · {rangeCapacity} patients/day</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4 border-t border-border">
                <Button type="button" variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
                <Button type="submit" disabled={generatingBulk}>
                  {generatingBulk ? 'Generating...' : `Generate ${totalDaysInRange} Slots`}
                </Button>
              </div>
            </form>
          )}
        </div>
      </ModalPortal>
    </>
  );
}




// Complete Partner Ledger & Monthly Balance Passbook System Component
function CompleteLedgerSection({
  userRef,
  role,
  currentUser
}: {
  userRef: string;
  role: 'DOCTOR' | 'AGENT';
  currentUser: UserAccount;
}) {
  const [ledger, setLedger] = useState<LedgerItem[]>([]);
  const [search, setSearch] = useState('');
  const [month, setMonth] = useState('2026-08');
  const [txType, setTxType] = useState('All');
  const [creditDebit, setCreditDebit] = useState('All');
  const [summary, setSummary] = useState<MonthlySummaryData | null>(null);
  const [selectedInfoItem, setSelectedInfoItem] = useState<LedgerItem | null>(null);
  const [showAdjustModal, setShowAdjustModal] = useState(false);

  // Adjustment Form State
  const [adjAmount, setAdjAmount] = useState('');
  const [adjType, setAdjType] = useState<'Credit' | 'Debit'>('Credit');
  const [shareType, setShareType] = useState<'Partner Share' | 'Agent Incentive' | 'General Correction'>('Partner Share');
  const [adjRemarks, setAdjRemarks] = useState('');

  const loadLedgerAndSummary = async () => {
    try {
      const q = new URLSearchParams({
        userRef,
        role,
        month,
        transactionType: txType,
        creditDebit,
        search,
      });
      const [lRes, sRes] = await Promise.all([
        fetch(`/api/ledgers?${q.toString()}`),
        fetch(`/api/ledgers/monthly-summary?userRef=${encodeURIComponent(userRef)}&month=${encodeURIComponent(month)}`),
      ]);
      setLedger(await lRes.json());
      setSummary(await sRes.json());
    } catch {
      toast.error('Failed to load partner financial ledger');
    }
  };

  useEffect(() => { loadLedgerAndSummary(); }, [userRef, role, month, txType, creditDebit, search]);

  const handleAdjustSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!adjAmount || Number(adjAmount) <= 0) {
      toast.error('Please enter a valid positive adjustment amount.'); return;
    }
    try {
      const res = await fetch('/api/ledgers/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userRef,
          role,
          amount: Number(adjAmount),
          adjustmentType: adjType,
          shareType,
          remarks: adjRemarks || `${adjType} manual adjustment`,
          date: today,
          createdBy: currentUser.name,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Non-destructive manual adjustment of ₹${Number(adjAmount).toLocaleString('en-IN')} saved to audit ledger!`);
      setShowAdjustModal(false);
      setAdjAmount(''); setAdjRemarks('');
      loadLedgerAndSummary();
    } catch {
      toast.error('Failed to submit manual balance adjustment');
    }
  };

  const isAdmin = currentUser.role === 'ADMIN' || currentUser.role === 'SUPER_ADMIN';

  return (
    <div className="space-y-6">
      {/* Monthly Financial Summary Card */}
      {summary && (
        <Panel className="p-6 bg-gradient-to-r from-background via-muted/30 to-background border-primary/20">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
            <div>
              <div className="mono text-[10px] font-bold uppercase tracking-[.18em] text-primary">Month-Wise Financial Reconciliation</div>
              <h3 className="text-xl font-bold text-foreground mt-0.5">{userRef} — {month} Monthly Statement</h3>
              <p className="text-xs text-muted-foreground mt-1">Formula: <span className="font-semibold text-foreground">Closing Balance = Opening Balance + Total Credit - Total Debit</span></p>
            </div>
            <div className="flex items-center gap-2">
              <Select value={month} onChange={(e) => setMonth(e.target.value)} className="w-[150px] font-bold">
                <option value="2026-08">August 2026</option>
                <option value="2026-07">July 2026</option>
                <option value="2026-06">June 2026</option>
                <option value="2026-09">September 2026</option>
              </Select>
              {isAdmin && (
                <Button onClick={() => setShowAdjustModal(true)} variant="secondary" className="gap-1.5 text-xs">
                  <Edit3 size={14} /> Adjust Balance
                </Button>
              )}
            </div>
          </div>

          <div className="mt-5 grid gap-4 grid-cols-2 lg:grid-cols-6">
            <div className="rounded-xl border border-border bg-card p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Opening Balance</div>
              <div className="mt-1 text-lg font-bold text-foreground">{money(summary.openingBalance)}</div>
            </div>
            <div className="rounded-xl border border-[#bce4db] bg-[#e5f5f1] p-3 text-[#167366]">
              <div className="text-[10px] font-bold uppercase tracking-wider">Total Credit (+)</div>
              <div className="mt-1 text-lg font-bold">{money(summary.totalCredit)}</div>
            </div>
            <div className="rounded-xl border border-[#f3c8c6] bg-[#fce9e8] p-3 text-[#b34b48]">
              <div className="text-[10px] font-bold uppercase tracking-wider">Total Debit (-)</div>
              <div className="mt-1 text-lg font-bold">{money(summary.totalDebit)}</div>
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#167366]">Partner Share</div>
              <div className="mt-1 text-lg font-bold text-[#167366]">{money(summary.totalPartnerShare)}</div>
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#a96816]">Agent Incentive</div>
              <div className="mt-1 text-lg font-bold text-[#a96816]">{money(summary.totalAgentIncentive)}</div>
            </div>
            <div className="rounded-xl border border-primary bg-primary/10 p-3 text-primary">
              <div className="text-[10px] font-bold uppercase tracking-wider">Closing Balance</div>
              <div className="mt-1 text-xl font-bold">{money(summary.closingBalance)}</div>
            </div>
          </div>
        </Panel>
      )}

      {/* Combinable Ledger Filters Bar */}
      <Panel className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by booking ID, patient name, transaction type, or remarks..."
              className="pl-9 text-xs"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={txType} onChange={(e) => setTxType(e.target.value)} className="w-[140px] text-xs">
              <option value="All">All Tx Types</option>
              <option value="Booking">Booking Commission</option>
              <option value="Payment">Payout Payment</option>
              <option value="Adjustment">Manual Adjustment</option>
              <option value="Refund">Refund</option>
            </Select>
            <Select value={creditDebit} onChange={(e) => setCreditDebit(e.target.value)} className="w-[130px] text-xs">
              <option value="All">Credit / Debit</option>
              <option value="Credit">Credit (Deposits)</option>
              <option value="Debit">Debit (Spends)</option>
            </Select>
            <Button variant="ghost" className="px-3 text-xs" onClick={() => { setSearch(''); setTxType('All'); setCreditDebit('All'); }}>
              Reset Filters
            </Button>
          </div>
        </div>
      </Panel>

      {/* Passbook Table */}
      <div>
        <h3 className="text-base font-bold mb-3">Audited Passbook Transactions ({ledger.length})</h3>
        {ledger.length ? (
          <PassbookLedgerTable ledgerItems={ledger} onShowInfo={(item) => setSelectedInfoItem(item)} role={role} currentUserRole={currentUser?.role} />
        ) : (
          <EmptyState icon={ReceiptText} title="No ledger records match filters" detail="Adjust search query or filter options." />
        )}
      </div>

      {/* Manual Balance Adjustment Modal */}
      <ModalPortal isOpen={showAdjustModal} onClose={() => setShowAdjustModal(false)} maxWidth="max-w-md">
        <div className="flex shrink-0 items-center justify-between border-b border-border p-6 pb-4 bg-card">
          <div>
            <h3 className="font-bold text-lg">Manual Balance Adjustment</h3>
            <p className="text-xs text-muted-foreground">Appends a non-destructive transaction record maintaining financial audit history.</p>
          </div>
          <button onClick={() => setShowAdjustModal(false)} className="grid size-8 place-items-center rounded-xl hover:bg-muted text-muted-foreground"><X size={16} /></button>
        </div>
        <form onSubmit={handleAdjustSubmit} className="flex flex-col min-h-0 flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 scrollbar-thin space-y-4">
            <Field label="Target Partner / Doctor / Agent">
              <Input value={userRef} disabled className="bg-muted font-bold" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Adjustment Type *">
                <Select value={adjType} onChange={(e) => setAdjType(e.target.value as any)}>
                  <option value="Credit">Credit (+) Deposit</option>
                  <option value="Debit">Debit (-) Spend</option>
                </Select>
              </Field>
              <Field label="Adjustment Amount (₹) *">
                <Input type="number" value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)} placeholder="e.g. 2000" min="1" required />
              </Field>
            </div>
            <Field label="Classification / Share Type">
              <Select value={shareType} onChange={(e) => setShareType(e.target.value as any)}>
                <option value="Partner Share">Partner Share</option>
                {role !== 'DOCTOR' && currentUser?.role !== 'DOCTOR' && (
                  <option value="Agent Incentive">Agent Incentive</option>
                )}
                <option value="General Correction">General Audit Correction</option>
              </Select>
            </Field>
            <Field label="Remarks & Justification *">
              <Input value={adjRemarks} onChange={(e) => setAdjRemarks(e.target.value)} placeholder="e.g. August reconciliation adjustment" required />
            </Field>
          </div>
          <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-muted/20 px-6 py-4">
            <Button type="button" variant="secondary" onClick={() => setShowAdjustModal(false)}>Cancel</Button>
            <Button type="submit">Post Adjustment</Button>
          </div>
        </form>
      </ModalPortal>

      {/* Info Breakdown Drawer */}
      <ModalPortal isOpen={!!selectedInfoItem} onClose={() => setSelectedInfoItem(null)} maxWidth="max-w-md">
        {selectedInfoItem && (
          <div className="p-6">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-bold text-base">Audited Transaction Details</h3>
              <button onClick={() => setSelectedInfoItem(null)} className="grid size-7 place-items-center rounded-full hover:bg-muted"><X size={16} /></button>
            </div>
            <div className="mt-4 space-y-2.5 text-xs">
              <div><span className="text-muted-foreground font-semibold">Transaction ID:</span> <span className="font-mono font-bold">{selectedInfoItem.id}</span></div>
              <div><span className="text-muted-foreground font-semibold">Date & Time:</span> <span className="font-mono">{selectedInfoItem.date}</span></div>
              <div><span className="text-muted-foreground font-semibold">User Reference:</span> <span className="font-bold">{selectedInfoItem.userRef} ({selectedInfoItem.role})</span></div>
              <div><span className="text-muted-foreground font-semibold">Particulars:</span> <span className="font-semibold">{selectedInfoItem.particulars}</span></div>
              {selectedInfoItem.bookingId && <div><span className="text-muted-foreground font-semibold">Booking ID:</span> <span className="font-mono font-bold">{selectedInfoItem.bookingId}</span></div>}
              {selectedInfoItem.patientName && <div><span className="text-muted-foreground font-semibold">Patient Name:</span> <span className="font-semibold">{selectedInfoItem.patientName}</span></div>}
              {selectedInfoItem.partnerShare ? <div><span className="text-muted-foreground font-semibold">Partner Share Allocated:</span> <span className="font-bold text-[#167366]">{money(selectedInfoItem.partnerShare)}</span></div> : null}
              {selectedInfoItem.agentIncentive && role !== 'DOCTOR' && currentUser?.role !== 'DOCTOR' ? <div><span className="text-muted-foreground font-semibold">Agent Incentive Allocated:</span> <span className="font-bold text-[#a96816]">{money(selectedInfoItem.agentIncentive)}</span></div> : null}
              {selectedInfoItem.spends ? <div><span className="text-muted-foreground font-semibold">Spends (Debit):</span> <span className="font-bold text-[#d94f4f]">{money(selectedInfoItem.spends)}</span></div> : null}
              {selectedInfoItem.deposits ? <div><span className="text-muted-foreground font-semibold">Deposits (Credit):</span> <span className="font-bold text-[#2e9c64]">{money(selectedInfoItem.deposits)}</span></div> : null}
              <div className="border-t border-border pt-2"><span className="text-muted-foreground font-semibold">Running Balance:</span> <span className="font-bold text-sm ml-2">₹ {selectedInfoItem.balance.toLocaleString('en-IN')}</span></div>
              {selectedInfoItem.remarks && <div className="rounded bg-muted/40 p-2 mt-2"><span className="text-muted-foreground block font-semibold">Remarks:</span> {selectedInfoItem.remarks}</div>}
            </div>
            <Button className="mt-5 w-full" onClick={() => setSelectedInfoItem(null)}>Close</Button>
          </div>
        )}
      </ModalPortal>
    </div>
  );
}

// Doctor Dashboard Component
function DoctorDashboard({ currentUser }: { currentUser: UserAccount }) {
  const [doctorsList, setDoctorsList] = useState<any[]>([]);
  const [doctorName, setDoctorName] = useState(currentUser.role === 'DOCTOR' ? currentUser.name : '');
  const [loading, setLoading] = useState(true);

  const loadDoctors = () => {
    setLoading(true);
    fetch('/api/doctors')
      .then((r) => r.json())
      .then((docs) => {
        setDoctorsList(docs);
        if (currentUser.role === 'DOCTOR') {
          setDoctorName(currentUser.name);
        } else if (docs.length > 0) {
          setDoctorName(docs[0].name);
        } else {
          setDoctorName('');
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDoctors();
  }, [currentUser]);

  return (
    <>
      <PageTitle
        eyebrow="Doctor Console & Ledger"
        title={doctorName ? `Doctor Dashboard — ${doctorName}` : 'Doctor Dashboard'}
        detail="Comprehensive partner share, ledger passbook, monthly balances, and patient cases."
        action={
          currentUser.role !== 'DOCTOR' && doctorsList.length > 0 && (
            <Select value={doctorName} onChange={(e) => setDoctorName(e.target.value)} className="w-[220px] font-bold">
              {doctorsList.map((doc) => (
                <option key={doc.id || doc.name} value={doc.name}>
                  {doc.name}
                </option>
              ))}
            </Select>
          )
        }
      />

      {loading ? (
        <Panel className="p-8 text-center text-xs text-muted-foreground">Loading doctor accounts...</Panel>
      ) : doctorsList.length === 0 && currentUser.role !== 'DOCTOR' ? (
        <Panel className="p-12 text-center rounded-3xl border-dashed border-2 border-border">
          <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground mb-3">
            <UserCheck size={24} />
          </div>
          <h3 className="font-bold text-base text-foreground">No Doctor Accounts Found</h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1 leading-relaxed">
            All dummy doctor accounts have been removed. When you create new doctor accounts in User Management, they will automatically appear here with their referral passbooks.
          </p>
          <Link href="/users">
            <Button className="mt-4 font-bold">
              <Plus size={15} /> Add Doctor in Users & Permissions
            </Button>
          </Link>
        </Panel>
      ) : (
        <CompleteLedgerSection userRef={doctorName} role="DOCTOR" currentUser={currentUser} />
      )}
    </>
  );
}

// Referral Agent Portal Component
function ReferralPortal({ currentUser }: { currentUser: UserAccount }) {
  const [agentsList, setAgentsList] = useState<any[]>([]);
  const [agentName, setAgentName] = useState(currentUser.role === 'AGENT' ? currentUser.name : '');
  const [loading, setLoading] = useState(true);

  const loadAgents = () => {
    setLoading(true);
    fetch('/api/agents')
      .then((r) => r.json())
      .then((agents) => {
        setAgentsList(agents);
        if (currentUser.role === 'AGENT') {
          setAgentName(currentUser.name);
        } else if (agents.length > 0) {
          setAgentName(agents[0].name);
        } else {
          setAgentName('');
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadAgents();
  }, [currentUser]);

  return (
    <>
      <PageTitle
        eyebrow="Referral Partner Console"
        title={agentName ? `Referral Agent Portal — ${agentName}` : 'Referral Agent Portal'}
        detail="Manage agent incentives, multi-test bookings, monthly balance summaries, and payouts."
        action={
          <div className="flex items-center gap-2">
            {currentUser.role !== 'AGENT' && agentsList.length > 0 && (
              <Select value={agentName} onChange={(e) => setAgentName(e.target.value)} className="w-[200px] font-bold">
                {agentsList.map((ag) => (
                  <option key={ag.id || ag.name} value={ag.name}>
                    {ag.name}
                  </option>
                ))}
              </Select>
            )}
            <Link href="/new-appointment"><Button><Plus size={16} /> New Referral Booking</Button></Link>
          </div>
        }
      />

      {loading ? (
        <Panel className="p-8 text-center text-xs text-muted-foreground">Loading referral agents...</Panel>
      ) : agentsList.length === 0 && currentUser.role !== 'AGENT' ? (
        <Panel className="p-12 text-center rounded-3xl border-dashed border-2 border-border">
          <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground mb-3">
            <UserCheck size={24} />
          </div>
          <h3 className="font-bold text-base text-foreground">No Referral Agents Found</h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1 leading-relaxed">
            All dummy agents have been removed. When you add referral partners in User Management, their performance and commission passbooks will appear here.
          </p>
          <Link href="/users">
            <Button className="mt-4 font-bold">
              <Plus size={15} /> Add Agent in Users & Permissions
            </Button>
          </Link>
        </Panel>
      ) : (
        <CompleteLedgerSection userRef={agentName} role="AGENT" currentUser={currentUser} />
      )}
    </>
  );
}

// Multi-Test & Home Collection Booking Creation Component
function NewAppointment({ currentUser }: { currentUser: UserAccount }) {
  const [location, navigate] = useLocation();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [tests, setTests] = useState<Test[]>([]);
  const [availableSlots, setAvailableSlots] = useState<Slot[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);

  // Patient Mode
  const [patientMode, setPatientMode] = useState<'registered' | 'custom'>('registered');
  const [patientId, setPatientId] = useState('');
  const [patientSearch, setPatientSearch] = useState('');
  const [customName, setCustomName] = useState('');
  const [customMobile, setCustomMobile] = useState('');
  const [customAge, setCustomAge] = useState('35');
  const [customGender, setCustomGender] = useState('Male');

  const filteredPatients = useMemo(() => {
    if (!patientSearch) return patients;
    const q = patientSearch.toLowerCase();
    return patients.filter((p) =>
      [p.name, p.uhid, p.mobile, p.email, p.gender, String(p.age)].some((v) => String(v || '').toLowerCase().includes(q))
    );
  }, [patients, patientSearch]);

  const selectedPatientObj = useMemo(() => patients.find((p) => p.id === patientId), [patients, patientId]);

  // Booking Type: Lab Visit or Home Collection
  const [isHomeCollection, setIsHomeCollection] = useState(false);
  const [address, setAddress] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [collectionDate, setCollectionDate] = useState(today);
  const [timeSlot, setTimeSlot] = useState('08:00 AM – 09:00 AM');

  // Multi-Test Selection Cart State
  const [selectedTests, setSelectedTests] = useState<TestItemSnapshot[]>([]);
  const [testSearch, setTestSearch] = useState('');
  const [bookingDate, setBookingDate] = useState(today);
  const [slotId, setSlotId] = useState('');
  const [sendWhatsApp, setSendWhatsApp] = useState(true);

  // Payment Collection Handler State: Oxycare (Center Direct) vs Partner (Doctor / Agent)
  const [paymentCollectedBy, setPaymentCollectedBy] = useState<'Oxycare' | 'Partner'>(
    currentUser.role === 'DOCTOR' || currentUser.role === 'AGENT' ? 'Partner' : 'Oxycare'
  );
  const [viewingParams, setViewingParams] = useState<{ testName: string; testCode?: string; parameters: TestParameter[] } | null>(null);
  const canViewIncentive = ['FRONTDESK', 'ADMIN', 'SUPER_ADMIN'].includes(currentUser.role);

  const [doctor, setDoctor] = useState('');
  const [referredBy, setReferredBy] = useState(currentUser.role === 'AGENT' ? currentUser.name : '');
  const [source, setSource] = useState(currentUser.role === 'AGENT' ? 'Referral Agent' : 'Walk-in');
  const [advancePayment, setAdvancePayment] = useState('0');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Mandatory Partner Lab Selection State
  const [partnerLabs, setPartnerLabs] = useState<PartnerLab[]>([]);
  const [selectedLabId, setSelectedLabId] = useState('');
  const [labSearch, setLabSearch] = useState('');
  const [isChangingLab, setIsChangingLab] = useState(false);

  useEffect(() => {
    fetch('/api/patients').then((r) => r.json()).then(setPatients);
    fetch('/api/partner-labs').then((r) => r.json()).then((labs: PartnerLab[]) => {
      setPartnerLabs(labs);
    });
    fetch('/api/tests').then((r) => r.json()).then((data: Test[]) => {
      setTests(data);
      if (data.length > 0) {
        const first = data[0] as any;
        setSelectedTests([{
          testId: first.id,
          testCode: first.testCode || 'TEST-01',
          testName: first.name,
          price: Number(first.price),
          partnerShare: Number(first.partnerShare || 0),
          agentIncentive: Number(first.agentIncentive || 0),
          instructions: first.instructions || 'Standard preparation',
          parameters: Array.isArray(first.parameters) ? first.parameters : [],
          quantity: 1,
          lineTotal: Number(first.price),
        }]);
      }
    });
    fetch('/api/doctors').then((r) => r.json()).then(setDoctors);
  }, []);

  // Auto-select initial partner lab conducting the selected test
  useEffect(() => {
    if (!selectedLabId && partnerLabs.length > 0 && selectedTests.length > 0) {
      const firstTest = selectedTests[0];
      const match = partnerLabs.find((l) =>
        (l.tests || []).some(
          (lt) =>
            lt.id === firstTest.testId ||
            (lt.testCode && lt.testCode.toLowerCase() === (firstTest.testCode || '').toLowerCase()) ||
            lt.name.toLowerCase() === firstTest.testName.toLowerCase()
        )
      );
      if (match) {
        setSelectedLabId(match.id);
      } else {
        setSelectedLabId(partnerLabs[0].id);
      }
    }
  }, [partnerLabs, selectedTests, selectedLabId]);

  const selectedLab = useMemo(() => partnerLabs.find((l) => l.id === selectedLabId), [partnerLabs, selectedLabId]);

  // All tests available across center master catalogue and partner labs
  const allAvailableTests = useMemo(() => {
    const list: any[] = [...tests];
    partnerLabs.forEach((lab) => {
      (lab.tests || []).forEach((lt) => {
        const alreadyExists = list.some(
          (t) =>
            t.id === lt.id ||
            (t.testCode && t.testCode.toLowerCase() === (lt.testCode || '').toLowerCase()) ||
            t.name.toLowerCase() === lt.name.toLowerCase()
        );
        if (!alreadyExists) {
          list.push({
            id: lt.id,
            name: lt.name,
            testCode: lt.testCode,
            department: lt.category || lt.department || 'Pathology',
            price: lt.price,
            partnerShare: lt.partnerShare || 0,
            agentIncentive: lt.agentIncentive || 0,
            instructions: lt.instructions || 'Standard preparation',
            parameters: lt.parameters || [],
          });
        }
      });
    });
    return list;
  }, [tests, partnerLabs]);

  // Filtered available tests for search dropdown
  const filteredTests = useMemo(() => {
    if (!testSearch) return allAvailableTests;
    const q = testSearch.toLowerCase();
    return allAvailableTests.filter((t: any) =>
      [t.name, t.shortName, t.testCode, t.department].some((v) => String(v || '').toLowerCase().includes(q))
    );
  }, [allAvailableTests, testSearch]);

  // Eligible partner labs filtered by tests selected in cart
  const eligibleLabs = useMemo(() => {
    if (selectedTests.length === 0) return [];
    const q = labSearch.toLowerCase().trim();

    return partnerLabs
      .map((lab) => {
        const labTests = lab.tests || [];
        let matchCount = 0;

        for (const st of selectedTests) {
          const stName = st.testName.toLowerCase().trim();
          const stCode = (st.testCode || '').toLowerCase().trim();
          const matches = labTests.some((lt) => {
            const ltName = lt.name.toLowerCase().trim();
            const ltCode = (lt.testCode || '').toLowerCase().trim();
            return (
              lt.id === st.testId ||
              (ltCode && ltCode === stCode) ||
              ltName === stName ||
              ltName.includes(stName) ||
              stName.includes(ltName)
            );
          });
          if (matches) matchCount++;
        }

        const conductsAll = matchCount === selectedTests.length;
        const conductsSome = matchCount > 0;

        return {
          lab,
          matchCount,
          conductsAll,
          conductsSome,
        };
      })
      .filter(({ lab }) => {
        if (q) {
          return [lab.name, lab.address, lab.city, lab.contactPerson].some((v) =>
            String(v || '').toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => {
        if (a.conductsAll && !b.conductsAll) return -1;
        if (!a.conductsAll && b.conductsAll) return 1;
        return b.matchCount - a.matchCount;
      });
  }, [partnerLabs, selectedTests, labSearch]);

  const handleSelectLab = (lab: PartnerLab) => {
    setSelectedLabId(lab.id);
    setLabSearch('');
    setIsChangingLab(false);
    // Sync partnerShare if the selected lab defines specific custom rates
    if (Array.isArray(lab.tests) && lab.tests.length > 0) {
      setSelectedTests((prev) =>
        prev.map((item) => {
          const matchedTest = lab.tests.find(
            (lt) =>
              lt.id === item.testId ||
              (lt.testCode && lt.testCode.toLowerCase() === (item.testCode || '').toLowerCase()) ||
              lt.name.toLowerCase() === item.testName.toLowerCase()
          );
          if (matchedTest) {
            return {
              ...item,
              partnerShare: matchedTest.partnerShare !== undefined ? Number(matchedTest.partnerShare) : item.partnerShare,
              agentIncentive: matchedTest.agentIncentive !== undefined ? Number(matchedTest.agentIncentive) : item.agentIncentive,
            };
          }
          return item;
        })
      );
    }
  };

  const addTestToCart = (t: any) => {
    setSelectedTests((prev) => {
      const existing = prev.find((item) => item.testId === t.id);
      if (existing) {
        return prev.map((item) => item.testId === t.id ? { ...item, quantity: item.quantity + 1, lineTotal: (item.quantity + 1) * item.price } : item);
      }
      return [
        ...prev,
        {
          testId: t.id,
          testCode: t.testCode || `TEST-${t.id}`,
          testName: t.name,
          price: Number(t.price),
          partnerShare: Number(t.partnerShare || 0),
          agentIncentive: Number(t.agentIncentive || 0),
          instructions: t.instructions || 'No special preparation required.',
          parameters: Array.isArray(t.parameters) ? t.parameters : [],
          quantity: 1,
          lineTotal: Number(t.price),
        }
      ];
    });
  };

  const removeTestFromCart = (id: string) => {
    setSelectedTests((prev) => prev.filter((item) => item.testId !== id));
  };

  const updateQuantity = (id: string, delta: number) => {
    setSelectedTests((prev) =>
      prev.map((item) => {
        if (item.testId === id) {
          const newQty = Math.max(1, item.quantity + delta);
          return { ...item, quantity: newQty, lineTotal: newQty * item.price };
        }
        return item;
      })
    );
  };

  // Cart financial totals
  const totalMRP = selectedTests.reduce((sum, item) => sum + (item.lineTotal || item.price * item.quantity), 0);
  const totalPartnerShare = selectedTests.reduce((sum, item) => sum + (item.partnerShare * item.quantity), 0);
  const totalAgentIncentive = selectedTests.reduce((sum, item) => sum + (item.agentIncentive * item.quantity), 0);
  const remainingBalance = Math.max(0, totalMRP - (Number(advancePayment) || 0));

  useEffect(() => {
    if (!bookingDate) return;
    fetch(`/api/slots?date=${bookingDate}`)
      .then((r) => r.json())
      .then((data) => {
        setAvailableSlots(data.filter((s: Slot) => Number(s.booked) < Number(s.capacity)));
      });
  }, [bookingDate]);

  const selectedSlot = availableSlots.find((s) => s.id === slotId);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!selectedLabId || !selectedLab) {
      toast.error('Partner Lab selection is mandatory. Please select a partner lab.');
      return;
    }
    if (patientMode === 'registered' && !patientId) {
      toast.error('Please select a registered patient.'); return;
    }
    if (patientMode === 'custom' && (!customName || !customMobile)) {
      toast.error('Patient full name and mobile number are required.'); return;
    }
    if (selectedTests.length === 0) {
      toast.error('At least one diagnostic test must be added to the booking.'); return;
    }
    if (isHomeCollection && (!address || !pinCode)) {
      toast.error('Full address and PIN code are required for Home Collection bookings.'); return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        partnerLabId: selectedLab.id,
        partnerLabName: selectedLab.name,
        partnerLabAddress: selectedLab.address,
        items: selectedTests,
        slotId: slotId || 'slot-cbc-1100',
        date: selectedSlot?.date || bookingDate,
        time: selectedSlot?.startTime || '09:30 AM',
        doctor: doctor || null,
        referredBy: referredBy || doctor || currentUser.name,
        source: isHomeCollection ? 'Home Collection' : source,
        totalPrice: totalMRP,
        advancePayment: Number(advancePayment),
        remainingAmount: remainingBalance,
        paymentCollectedBy,
        notes,
        isHomeCollection,
        bookingType: isHomeCollection ? 'Home Collection' : 'Lab Visit',
        address: isHomeCollection ? address : null,
        pinCode: isHomeCollection ? pinCode : null,
        collectionDate: isHomeCollection ? collectionDate : bookingDate,
        timeSlot: isHomeCollection ? timeSlot : '09:30 AM',
        createdBy: currentUser.name,
        sendWhatsApp,
      };

      if (patientMode === 'registered') {
        payload.patientId = patientId;
      } else {
        payload.patientName = customName;
        payload.mobile = customMobile;
        payload.age = Number(customAge);
        payload.gender = customGender;
      }

      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create booking');
      }
      toast.success(
        sendWhatsApp
          ? `✅ Booking created & WhatsApp confirmation dispatched to patient!`
          : `✅ Booking created successfully (${selectedTests.length} tests)!`
      );
      queryClient.invalidateQueries({ queryKey: getListAppointmentsQueryKey() });
      navigate('/appointments');
    } catch (err: any) {
      toast.error(err.message || 'Could not create appointment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageTitle eyebrow="Frontdesk & Partner Booking" title="Create Patient Booking" detail="Select single or multiple diagnostic tests/packages, specify partner lab, and snapshot financial rates." />
      <Panel className="max-w-4xl p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Home Collection vs Center Visit Mode Switcher */}
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Truck className="text-primary" size={20} />
                <div>
                  <div className="font-bold text-sm text-foreground">Booking Workflow Type</div>
                  <div className="text-xs text-muted-foreground">Toggle between Center/Lab Visit and Home Sample Collection</div>
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer rounded-xl bg-card border border-border px-3 py-1.5 shadow-sm">
                <input
                  type="checkbox"
                  checked={isHomeCollection}
                  onChange={(e) => setIsHomeCollection(e.target.checked)}
                  className="size-4 rounded border-input text-primary focus:ring-primary"
                />
                <span className="text-xs font-bold">{isHomeCollection ? 'Home Collection Booking' : 'Regular Lab Visit'}</span>
              </label>
            </div>

            {/* Home Collection Address & Time Slot Fields */}
            {isHomeCollection && (
              <div className="mt-4 pt-4 border-t border-primary/15 grid gap-3 sm:grid-cols-2">
                <Field label="Collection Date *">
                  <Input type="date" value={collectionDate} onChange={(e) => setCollectionDate(e.target.value)} />
                </Field>
                <Field label="Preferred Time Slot *">
                  <Select value={timeSlot} onChange={(e) => setTimeSlot(e.target.value)}>
                    <option value="07:00 AM – 08:00 AM">07:00 AM – 08:00 AM</option>
                    <option value="08:00 AM – 09:00 AM">08:00 AM – 09:00 AM</option>
                    <option value="09:00 AM – 10:00 AM">09:00 AM – 10:00 AM</option>
                    <option value="10:00 AM – 11:00 AM">10:00 AM – 11:00 AM</option>
                    <option value="11:00 AM – 12:00 PM">11:00 AM – 12:00 PM</option>
                    <option value="04:00 PM – 05:00 PM">04:00 PM – 05:00 PM</option>
                  </Select>
                </Field>
                <Field label="Full Patient Home Address *" className="sm:col-span-2">
                  <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="House/Flat No., Street, Landmark, Area..." required />
                </Field>
                <Field label="PIN Code *">
                  <Input value={pinCode} onChange={(e) => setPinCode(e.target.value)} placeholder="e.g. 560034" required />
                </Field>
              </div>
            )}
          </div>

          {/* Patient Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground">Patient Information *</span>
              <div className="flex rounded-lg border border-border bg-muted p-0.5 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setPatientMode('registered')}
                  className={cx('rounded-md px-3 py-1 transition-all', patientMode === 'registered' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}
                >
                  Registered Patient
                </button>
                <button
                  type="button"
                  onClick={() => setPatientMode('custom')}
                  className={cx('rounded-md px-3 py-1 transition-all', patientMode === 'custom' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}
                >
                  New Patient
                </button>
              </div>
            </div>

            {patientMode === 'registered' ? (
              <div className="space-y-3">
                {selectedPatientObj ? (
                  <div className="flex items-center justify-between rounded-2xl border border-primary/30 bg-primary/5 p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground font-bold text-sm">
                        {initials(selectedPatientObj.name)}
                      </div>
                      <div>
                        <div className="font-bold text-sm text-foreground flex items-center gap-2">
                          <span>{selectedPatientObj.name}</span>
                          <span className="mono rounded bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">{selectedPatientObj.uhid}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Mobile: {selectedPatientObj.mobile} · {selectedPatientObj.age} yrs ({selectedPatientObj.gender})
                        </div>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-xs font-semibold hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => { setPatientId(''); setPatientSearch(''); }}
                    >
                      <X size={15} /> Change Patient
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Field label="Search Registered Patient *">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                        <Input
                          value={patientSearch}
                          onChange={(e) => setPatientSearch(e.target.value)}
                          placeholder="Type patient name, UHID, mobile number to search..."
                          className="pl-9"
                        />
                      </div>
                    </Field>

                    {patientSearch && (
                      <div className="max-h-48 overflow-y-auto rounded-2xl border border-border bg-card p-2 shadow-lg space-y-1 scrollbar-thin">
                        {filteredPatients.length === 0 ? (
                          <div className="p-3 text-center text-xs text-muted-foreground">No registered patients found matching "{patientSearch}"</div>
                        ) : (
                          filteredPatients.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => { setPatientId(p.id); setPatientSearch(''); }}
                              className="flex w-full items-center justify-between rounded-xl p-2.5 text-left text-xs hover:bg-primary/10 transition-colors"
                            >
                              <div>
                                <span className="font-bold text-foreground">{p.name}</span>
                                <span className="mono text-[10px] text-muted-foreground ml-2">({p.uhid})</span>
                              </div>
                              <div className="text-muted-foreground font-mono">{p.mobile} · {p.age}y</div>
                            </button>
                          ))
                        )}
                      </div>
                    )}

                    <Field label="Or Select From Registered Patients Dropdown">
                      <Select value={patientId} onChange={(e) => setPatientId(e.target.value)}>
                        <option value="">Choose registered patient...</option>
                        {filteredPatients.map((p) => (
                          <option key={p.id} value={p.id}>{p.name} — {p.uhid} · {p.mobile} ({p.age}y {p.gender})</option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid gap-3 rounded-2xl border border-border bg-muted/20 p-4 sm:grid-cols-2">
                <Field label="Patient Full Name *"><Input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="e.g. Rahul Sharma" required /></Field>
                <Field label="Mobile Number *"><Input value={customMobile} onChange={(e) => setCustomMobile(e.target.value)} placeholder="e.g. 9876543210" required /></Field>
                <Field label="Age (Years)"><Input type="number" value={customAge} onChange={(e) => setCustomAge(e.target.value)} /></Field>
                <Field label="Gender">
                  <Select value={customGender} onChange={(e) => setCustomGender(e.target.value)}>
                    <option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option>
                  </Select>
                </Field>
              </div>
            )}
          </div>

          {/* Multiple Test Selection & Cart Table */}
          <div className="space-y-4 border-t border-border pt-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-foreground">Select Multiple Tests & Packages</h3>
                <p className="text-xs text-muted-foreground">
                  {selectedLab ? `Available test catalogue conducted by ${selectedLab.name}` : 'Search and add multiple diagnostic investigations to a single booking.'}
                </p>
              </div>
              <span className="mono rounded bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">{selectedTests.length} Tests Selected</span>
            </div>

            {/* Test Search & Picker */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
              <Input
                value={testSearch}
                onChange={(e) => setTestSearch(e.target.value)}
                placeholder={selectedLab ? `Search tests in ${selectedLab.name} (e.g. CBC, Lipid, Thyroid)...` : "Search test by name, test code (e.g. CBC-01), department..."}
                className="pl-9"
              />
              {testSearch && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-xl border border-border bg-card shadow-xl p-1">
                  {filteredTests.map((t: any) => {
                    const paramList = Array.isArray(t.parameters) && t.parameters.length > 0
                      ? t.parameters
                      : (String(t.name).toLowerCase().includes('cbc') || String(t.testCode).toLowerCase().includes('cbc')
                          ? [
                              { name: 'Hemoglobin (Hb)' }, { name: 'Total Leukocyte Count (TLC)' },
                              { name: 'Platelet Count' }, { name: 'RBC Count' },
                              { name: 'Packed Cell Volume' }, { name: 'MCV' },
                              { name: 'MCH' }, { name: 'Neutrophils %' }
                            ]
                          : String(t.name).toLowerCase().includes('thyroid')
                          ? [{ name: 'Total T3' }, { name: 'Total T4' }, { name: 'TSH' }]
                          : String(t.name).toLowerCase().includes('mri')
                          ? [{ name: 'Brain Parenchyma' }, { name: 'Ventricular System' }, { name: 'DWI' }]
                          : String(t.name).toLowerCase().includes('pet')
                          ? [{ name: 'Metabolic Mapping' }, { name: 'FDG Uptake' }]
                          : [{ name: `${t.name} Core Value` }, { name: 'Quantitative Marker' }, { name: 'Differential Index' }]);

                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => { addTestToCart({ ...t, parameters: paramList }); setTestSearch(''); }}
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs text-left hover:bg-muted transition-colors"
                      >
                        <div className="flex-1 pr-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold">{t.name}</span>
                            <span className="mono text-[10px] text-muted-foreground">({t.testCode || t.id})</span>
                            <span className="mono rounded bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary flex items-center gap-1">
                              🔬 {paramList.length} Parameters Covered
                            </span>
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {t.department} · Pre-prep: {t.instructions || 'No special preparation needed.'}
                          </div>
                          <div className="text-[10px] text-primary/80 font-medium truncate max-w-[380px] mt-0.5">
                            🔬 Included: {paramList.map((p: any) => p.name).join(', ')}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-bold text-primary">{money(t.price)}</div>
                          <div className="text-[9px] text-[#167366] font-medium">Share: {money(t.partnerShare || 0)}</div>
                          {canViewIncentive && (
                            <div className="text-[9px] text-[#a96816]">Inc: {money(t.agentIncentive || 0)}</div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Selected Tests Cart Table */}
            {selectedTests.length > 0 ? (
              <div className="overflow-x-auto rounded-2xl border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/45 text-[10px] uppercase font-bold text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Test Code & Name</th>
                      <th className="px-3 py-3">Patient Preparation Instructions</th>
                      <th className="px-3 py-3 text-right">Price</th>
                      <th className="px-3 py-3 text-right text-[#167366]">Partner Share</th>
                      {canViewIncentive && <th className="px-3 py-3 text-right text-[#a96816]">Agent Inc.</th>}
                      <th className="px-3 py-3 text-center">Qty</th>
                      <th className="px-3 py-3 text-right">Line Total</th>
                      <th className="px-3 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border font-medium">
                    {selectedTests.map((item) => (
                      <tr key={item.testId} className="hover:bg-muted/20">
                        <td className="px-4 py-3 font-semibold">
                          <div>{item.testName}</div>
                          <div className="mono text-[10px] text-muted-foreground">{item.testCode}</div>
                          <div className="mt-1">
                            {item.parameters && item.parameters.length > 0 ? (
                              <button
                                type="button"
                                onClick={() => setViewingParams({ testName: item.testName, testCode: item.testCode, parameters: item.parameters || [] })}
                                className="inline-flex items-center gap-1 rounded border border-primary/25 bg-primary/10 hover:bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary transition-colors"
                              >
                                <FlaskConical size={11} /> {item.parameters.length} Parameters (Inspect)
                              </button>
                            ) : (
                              <span className="text-[10px] text-muted-foreground italic">Standard Test Panel</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-muted-foreground text-[11px] max-w-[200px]">
                          {item.instructions || 'No special preparation'}
                        </td>
                        <td className="px-3 py-3 text-right font-bold text-foreground">{money(item.price)}</td>
                        <td className="px-3 py-3 text-right font-semibold text-[#167366]">{money(item.partnerShare)}</td>
                        {canViewIncentive && (
                          <td className="px-3 py-3 text-right font-semibold text-[#a96816]">{money(item.agentIncentive)}</td>
                        )}
                        <td className="px-3 py-3 text-center">
                          <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-1.5 py-0.5">
                            <button type="button" onClick={() => updateQuantity(item.testId, -1)} className="hover:text-primary font-bold px-1">-</button>
                            <span className="mono font-bold px-1">{item.quantity}</span>
                            <button type="button" onClick={() => updateQuantity(item.testId, 1)} className="hover:text-primary font-bold px-1">+</button>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right font-bold text-primary">{money(item.lineTotal || item.price * item.quantity)}</td>
                        <td className="px-3 py-3 text-right">
                          <button type="button" onClick={() => removeTestFromCart(item.testId)} className="text-muted-foreground hover:text-destructive p-1">
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                No tests added yet. Search above to add tests to this booking.
              </div>
            )}

            {/* Mandatory Partner Lab Selection (Filtered by tests chosen above) */}
            <div className="rounded-2xl border border-border bg-card p-4 space-y-3 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                <div className="flex items-center gap-2">
                  <div className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary shrink-0">
                    <Building2 size={16} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs uppercase tracking-wider text-foreground">Assigned Partner Laboratory</span>
                      <span className="mono rounded bg-destructive/10 px-1.5 py-0.2 text-[9px] font-bold text-destructive">MANDATORY *</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">Select the outsourced partner laboratory conducting these investigation(s).</p>
                  </div>
                </div>
                {selectedLab && (
                  <span className="mono flex items-center gap-1 rounded-lg bg-[#e5f5f1] px-2.5 py-1 text-xs font-bold text-[#167366] border border-[#bce4db] w-fit shrink-0">
                    <CheckCircle2 size={13} /> {selectedLab.name}
                  </span>
                )}
              </div>

              {selectedTests.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-muted/20 p-3.5 text-center text-xs text-muted-foreground">
                  🔬 Please select diagnostic test(s) above first. Partner labs offering those tests will automatically appear for selection.
                </div>
              ) : selectedLab && !isChangingLab ? (
                <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 p-3 shadow-xs">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shrink-0 shadow-xs">
                      <Building2 size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-foreground">{selectedLab.name}</span>
                        <span className="mono rounded bg-[#e5f5f1] text-[#167366] px-2 py-0.5 text-[10px] font-bold border border-[#bce4db]">
                          Conducts Selected Tests
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5 truncate">
                        <span>📍 {selectedLab.address}</span>
                        {selectedLab.city && <span>· {selectedLab.city}</span>}
                        {selectedLab.phone && <span>· 📞 {selectedLab.phone}</span>}
                      </div>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-8 text-xs font-semibold gap-1 shrink-0 ml-3 bg-card hover:bg-muted"
                    onClick={() => { setIsChangingLab(true); setLabSearch(''); }}
                  >
                    <Edit3 size={13} /> Change Lab
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                  <Input
                    value={labSearch}
                    onChange={(e) => setLabSearch(e.target.value)}
                    placeholder={`Search partner labs offering ${selectedTests.map(t => t.testName).slice(0, 2).join(', ')}...`}
                    className="pl-9 bg-card"
                    autoFocus={isChangingLab}
                  />
                  {/* Autocomplete Dropdown */}
                  <div className="mt-1.5 max-h-56 overflow-y-auto rounded-xl border border-border bg-card shadow-2xl p-1.5 space-y-1">
                    {eligibleLabs.length === 0 ? (
                      <div className="p-4 text-center text-xs text-muted-foreground">
                        No partner labs found matching "{labSearch}".
                      </div>
                    ) : (
                      eligibleLabs.map(({ lab, conductsAll, matchCount }) => (
                        <button
                          key={lab.id}
                          type="button"
                          onClick={() => handleSelectLab(lab)}
                          className={cx(
                            'flex w-full items-center justify-between rounded-lg p-2.5 text-left text-xs transition-colors hover:bg-muted/70 cursor-pointer',
                            selectedLabId === lab.id ? 'bg-primary/10 border border-primary/30' : ''
                          )}
                        >
                          <div>
                            <div className="font-bold text-foreground flex items-center gap-2">
                              {lab.name}
                              {lab.city && <span className="mono text-[10px] rounded bg-muted px-1.5 py-0.2 text-muted-foreground">{lab.city}</span>}
                            </div>
                            <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                              <MapPin size={11} className="shrink-0" /> {lab.address}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            {conductsAll ? (
                              <span className="mono rounded bg-[#e5f5f1] text-[#167366] border border-[#bce4db] px-2 py-0.5 text-[10px] font-bold">
                                ✓ Offers All Tests
                              </span>
                            ) : matchCount > 0 ? (
                              <span className="mono rounded bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 text-[10px] font-bold">
                                Offers {matchCount}/{selectedTests.length} Tests
                              </span>
                            ) : (
                              <span className="mono rounded bg-muted text-muted-foreground px-2 py-0.5 text-[10px]">
                                Partner Lab
                              </span>
                            )}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                  {isChangingLab && selectedLab && (
                    <div className="mt-1.5 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setIsChangingLab(false)}
                        className="text-xs text-muted-foreground hover:text-foreground font-semibold hover:underline"
                      >
                        Keep current lab ({selectedLab.name})
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Financial Summary Card */}
            <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-4">
              <div className={cx('grid gap-4', canViewIncentive ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
                <div className="rounded-xl border border-border bg-card p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total Test Charges (MRP)</div>
                  <div className="mt-1 text-xl font-bold text-foreground">{money(totalMRP)}</div>
                </div>
                <div className="rounded-xl border border-[#bce4db] bg-[#e5f5f1] p-3 text-[#167366]">
                  <div className="text-[10px] font-bold uppercase tracking-wider">
                    {currentUser.role === 'DOCTOR' ? 'Your Doctor Partner Share' : 'Total Partner Share'}
                  </div>
                  <div className="mt-1 text-xl font-bold">{money(totalPartnerShare)}</div>
                </div>
                {canViewIncentive && (
                  <div className="rounded-xl border border-[#f5dfb8] bg-[#fff2dd] p-3 text-[#a96816]">
                    <div className="text-[10px] font-bold uppercase tracking-wider">Total Agent Incentive</div>
                    <div className="mt-1 text-xl font-bold">{money(totalAgentIncentive)}</div>
                  </div>
                )}
              </div>

              {/* Payment Collection Channel Selector */}
              <div className="pt-3 border-t border-border space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <HandCoins className="text-primary" size={17} />
                    <div className="font-bold text-xs uppercase tracking-wider text-foreground">
                      Payment Collection Channel *
                    </div>
                  </div>
                  <span className={cx(
                    'mono text-[10px] font-bold px-2.5 py-0.5 rounded-full border',
                    paymentCollectedBy === 'Oxycare'
                      ? 'bg-primary/10 text-primary border-primary/30'
                      : 'bg-[#e5f5f1] text-[#167366] border-[#167366]/30'
                  )}>
                    {paymentCollectedBy === 'Oxycare' ? 'Owner / Oxycare Direct' : 'Partner Handled'}
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setPaymentCollectedBy('Oxycare')}
                    className={cx(
                      'flex items-start gap-3 rounded-xl border p-3 text-left transition-all',
                      paymentCollectedBy === 'Oxycare'
                        ? 'border-primary bg-primary/5 ring-2 ring-primary/20 shadow-xs'
                        : 'border-border bg-card hover:bg-muted/40'
                    )}
                  >
                    <div className={cx('grid size-8 place-items-center rounded-lg mt-0.5 shrink-0', paymentCollectedBy === 'Oxycare' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                      <Building2 size={16} />
                    </div>
                    <div>
                      <div className="font-bold text-xs text-foreground flex items-center gap-1.5">
                        Collected by Oxycare (Owner)
                        {paymentCollectedBy === 'Oxycare' && <CheckCircle2 size={13} className="text-primary" />}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                        Collected directly by Oxycare Diagnostic Center via Cash, UPI, or Card at center counter or phlebotomist visit.
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentCollectedBy('Partner')}
                    className={cx(
                      'flex items-start gap-3 rounded-xl border p-3 text-left transition-all',
                      paymentCollectedBy === 'Partner'
                        ? 'border-[#167366] bg-[#e5f5f1]/60 ring-2 ring-[#167366]/20 shadow-xs'
                        : 'border-border bg-card hover:bg-muted/40'
                    )}
                  >
                    <div className={cx('grid size-8 place-items-center rounded-lg mt-0.5 shrink-0', paymentCollectedBy === 'Partner' ? 'bg-[#167366] text-white' : 'bg-muted text-muted-foreground')}>
                      <UserCheck size={16} />
                    </div>
                    <div>
                      <div className="font-bold text-xs text-foreground flex items-center gap-1.5">
                        Collected by Partner (Doctor / Agent)
                        {paymentCollectedBy === 'Partner' && <CheckCircle2 size={13} className="text-[#167366]" />}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                        Collected directly by the Partner / Doctor who is making this booking. Reconciled through partner ledger passbook.
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t border-border">
                <Field label="Advance Payment Received (₹)">
                  <Input type="number" value={advancePayment} onChange={(e) => setAdvancePayment(e.target.value)} />
                </Field>
                <div className="flex flex-col justify-end">
                  <div className="text-xs text-muted-foreground font-semibold">Remaining Net Amount Due:</div>
                  <div className={cx('mono text-lg font-bold mt-1', remainingBalance > 0 ? 'text-amber-600' : 'text-emerald-600')}>
                    {remainingBalance > 0 ? money(remainingBalance) : 'Fully Paid'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Referring Doctor">
              <Select value={doctor} onChange={(e) => { setDoctor(e.target.value); if (!referredBy) setReferredBy(e.target.value); }}>
                <option value="">Direct / Self Referral</option>
                {doctors.map((d) => <option key={d.id} value={d.name}>{d.name} ({d.hospital})</option>)}
              </Select>
            </Field>
            <Field label="Booking Source">
              <Select value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="Walk-in">Walk-in Direct</option>
                <option value="Referral Agent">Referral Agent</option>
                <option value="Doctor">Referring Doctor</option>
                <option value="Home Collection">Home Collection</option>
              </Select>
            </Field>
          </div>

          <Field label="Clinical Notes / Special Instructions">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Fasting 8 hrs required, patient brought prior scans" />
          </Field>

          {/* WhatsApp Notification Opt-in & Live Preview Card */}
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 transition-all">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="grid size-9 place-items-center rounded-xl bg-emerald-500/15 text-emerald-600">
                  <MessageSquare size={18} />
                </div>
                <div>
                  <div className="font-bold text-sm text-foreground flex items-center gap-2">
                    WhatsApp Patient Notification
                    <span className="mono rounded bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 font-bold border border-emerald-300">
                      Auto Dispatch
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Send booking confirmation, appointment slip, and test instructions to patient's mobile number.
                  </div>
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none bg-card border border-border px-3 py-1.5 rounded-xl hover:border-emerald-500/50 transition-colors">
                <input
                  type="checkbox"
                  checked={sendWhatsApp}
                  onChange={(e) => setSendWhatsApp(e.target.checked)}
                  className="size-4 rounded border-border text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
                <span className="text-xs font-bold text-foreground">
                  {sendWhatsApp ? 'Message Enabled' : 'Do Not Send'}
                </span>
              </label>
            </div>

            {sendWhatsApp && (
              <div className="mt-3 rounded-xl border border-emerald-500/20 bg-card p-3.5 text-xs space-y-2 animate-in fade-in zoom-in-95">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground border-b border-border pb-2">
                  <span>Recipient Phone: <strong className="text-foreground mono">{patientMode === 'registered' ? (selectedPatientObj?.mobile || 'Selected patient phone') : (customMobile || 'Provided phone')}</strong></span>
                  <span className="text-emerald-700 font-semibold flex items-center gap-1">
                    <CheckCircle2 size={12} /> Ready to send via WhatsApp API
                  </span>
                </div>
                <div className="text-foreground/80 italic font-sans leading-relaxed pt-0.5">
                  "Namaste {patientMode === 'registered' ? (selectedPatientObj?.name || 'Patient') : (customName || 'Patient')}! Your diagnostic booking for {selectedTests.map((t) => t.testName).join(', ') || 'selected tests'} on {bookingDate} is confirmed at Oxycare Diagnostics ({isHomeCollection ? 'Home Collection' : 'Lab Visit'}). Total MRP: {money(totalMRP)}, Advance Paid: {money(Number(advancePayment))}, Balance: {money(remainingBalance)}. Payment Collection: {paymentCollectedBy === 'Partner' ? 'Handled by Partner' : 'Collected by Oxycare Diagnostics'}. We look forward to serving you."
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Button type="button" variant="secondary" onClick={() => navigate('/appointments')}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? 'Creating Booking...' : `Confirm Booking (${selectedTests.length} Tests — ${money(totalMRP)})`}</Button>
          </div>
        </form>
      </Panel>

      {/* Test Parameters Inspect Modal */}
      <ModalPortal isOpen={!!viewingParams} onClose={() => setViewingParams(null)} maxWidth="max-w-lg">
        {viewingParams && (
          <>
            <div className="flex shrink-0 items-center justify-between border-b border-border p-5 pb-3 bg-card">
              <div>
                <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                  <FlaskConical size={18} className="text-primary" />
                  <span>Investigation Parameters</span>
                  <span className="mono rounded bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                    {viewingParams.parameters.length} parameters
                  </span>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {viewingParams.testName} {viewingParams.testCode ? `· ${viewingParams.testCode}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingParams(null)}
                className="grid size-8 place-items-center rounded-xl hover:bg-muted text-muted-foreground"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 scrollbar-thin">
              {viewingParams.parameters.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                  No individual sub-parameters recorded for this diagnostic test. Laboratory processes standard profile.
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-border">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted/60 text-[10px] uppercase font-bold text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2.5">Investigation Parameter</th>
                        <th className="px-3 py-2.5">Standard Unit</th>
                        <th className="px-3 py-2.5">Normal Reference Range</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {viewingParams.parameters.map((param, idx) => (
                        <tr key={idx} className="hover:bg-muted/30">
                          <td className="px-3 py-2.5 font-semibold text-foreground">{param.name}</td>
                          <td className="px-3 py-2.5 text-muted-foreground font-mono">{param.unit || '—'}</td>
                          <td className="px-3 py-2.5 text-emerald-700 font-semibold font-mono">{param.normalRange || 'Standard'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center justify-between p-4 border-t border-border bg-muted/20 text-xs text-muted-foreground">
              <span>All parameters are verified before lab report release.</span>
              <Button type="button" onClick={() => setViewingParams(null)}>Close</Button>
            </div>
          </>
        )}
      </ModalPortal>
    </>
  );
}

function Patients() {
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const query = useListPatients({ search: search || undefined });

  return (
    <>
      <PageTitle
        eyebrow="Master Data"
        title="Patient Master"
        detail="Central directory of registered patients for instant booking with search."
        action={<Button onClick={() => setShowCreate(true)}><Plus size={16} /> Add patient</Button>}
      />
      <Panel>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by patient name, UHID, mobile, email..."
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-muted px-3 text-xs text-muted-foreground">
            <UsersRound size={15} /> {query.data?.length ?? 0} records
          </div>
        </div>
        <QueryState loading={query.isLoading} error={!!query.error} retry={() => query.refetch()}>
          {query.data?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] text-left">
                <thead className="bg-muted/45 text-[10px] uppercase tracking-[.12em] text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 font-bold">Patient</th>
                    <th className="px-4 py-3 font-bold">Contact</th>
                    <th className="px-4 py-3 font-bold">Profile</th>
                    <th className="px-4 py-3 font-bold">Last visit</th>
                    <th className="px-4 py-3 font-bold">Visits</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {query.data.map((patient) => (
                    <tr key={patient.id} className="transition-colors hover:bg-muted/35">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="grid size-9 place-items-center rounded-full bg-[#dcefeb] text-xs font-bold text-[#187367]">
                            {initials(patient.name)}
                          </div>
                          <div>
                            <div className="text-sm font-semibold">{patient.name}</div>
                            <div className="mono mt-0.5 text-[10px] text-muted-foreground">{patient.uhid}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-xs">{patient.mobile}</div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">{patient.email || 'No email'}</div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-xs">{patient.age} yrs · {titleCase(patient.gender)}</div>
                      </td>
                      <td className="px-4 py-4 text-xs text-muted-foreground">{formatDay(patient.lastVisit)}</td>
                      <td className="px-4 py-4">
                        <span className="mono text-xs font-bold">{patient.totalVisits}</span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-primary">
                          <Phone size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={UsersRound}
              title="No patients found"
              detail="Add a patient to begin booking."
              action={<Button onClick={() => setShowCreate(true)}><Plus size={15} /> Add patient</Button>}
            />
          )}
        </QueryState>
      </Panel>
      {showCreate && <PatientDialog onClose={() => setShowCreate(false)} />}
    </>
  );
}

function PatientDialog({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<PatientInput>({ name: '', mobile: '', whatsapp: '', email: '', age: 0, gender: 'female' });
  const mutation = useCreatePatient();
  const queryClient = useQueryClient();
  const set = (key: keyof PatientInput, value: string | number) => setForm((current) => ({ ...current, [key]: value }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || form.mobile.length < 8) {
      toast.error('Valid name and mobile required');
      return;
    }
    mutation.mutate(
      { data: form },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPatientsQueryKey() });
          toast.success('Patient created');
          onClose();
        },
        onError: () => toast.error('Could not create patient')
      }
    );
  };

  return (
    <ModalPortal isOpen={true} onClose={onClose} maxWidth="max-w-lg">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4 bg-card">
        <div>
          <div className="mono text-[10px] font-bold uppercase tracking-[.18em] text-primary">New Record</div>
          <h2 className="mt-0.5 text-xl font-bold">Add Patient</h2>
        </div>
        <button onClick={onClose} className="grid size-9 place-items-center rounded-xl text-muted-foreground hover:bg-muted">
          <X size={18} />
        </button>
      </div>
      <form onSubmit={submit} className="flex flex-col min-h-0 flex-1 overflow-hidden">
        <div className="grid gap-4 p-6 sm:grid-cols-2 flex-1 overflow-y-auto scrollbar-thin">
          <Field label="Full name *" className="sm:col-span-2">
            <Input value={form.name} onChange={(event) => set('name', event.target.value)} placeholder="e.g. Meera Shah" />
          </Field>
          <Field label="Mobile number *">
            <Input value={form.mobile} onChange={(event) => set('mobile', event.target.value)} placeholder="+91 98..." />
          </Field>
          <Field label="WhatsApp number">
            <Input value={form.whatsapp} onChange={(event) => set('whatsapp', event.target.value)} placeholder="Same as mobile" />
          </Field>
          <Field label="Age">
            <Input type="number" min="0" value={form.age} onChange={(event) => set('age', Number(event.target.value))} />
          </Field>
          <Field label="Gender">
            <Select value={form.gender} onChange={(event) => set('gender', event.target.value)}>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          <Field label="Email address" className="sm:col-span-2">
            <Input type="email" value={form.email} onChange={(event) => set('email', event.target.value)} placeholder="Optional" />
          </Field>
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-muted/20 px-6 py-4">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving...' : 'Create patient'}</Button>
        </div>
      </form>
    </ModalPortal>
  );
}

// User Accounts Component with Detailed Creation & Granular Permission Matrix
function UserAccounts({ currentUser }: { currentUser: UserAccount }) {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editUser, setEditUser] = useState<UserAccount | null>(null);
  const [deleteUser, setDeleteUser] = useState<UserAccount | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Form State (shared for Add and Edit)
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('FRONTDESK');
  const [branch, setBranch] = useState('Indiranagar');
  const [mobile, setMobile] = useState('');
  const [designation, setDesignation] = useState('Frontdesk Operations Executive');
  const [active, setActive] = useState(true);
  const [perms, setPerms] = useState<string[]>(ROLE_DEFAULT_PERMISSIONS.FRONTDESK);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/users');
      setUsers(await res.json());
    } catch {
      toast.error('Failed to load user accounts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadUsers(); }, []);

  const handleRoleChange = (newRole: Role) => {
    setRole(newRole);
    setPerms(ROLE_DEFAULT_PERMISSIONS[newRole] || []);
    if (newRole === 'DOCTOR') setDesignation('Consultant Physician / Pathologist');
    else if (newRole === 'AGENT') setDesignation('Executive Referral Partner');
    else if (newRole === 'ADMIN') setDesignation('Center Operations Manager');
    else if (newRole === 'SUPER_ADMIN') setDesignation('Managing Director / Medical Director');
    else setDesignation('Frontdesk Operations Executive');
  };

  const filteredUsers = useMemo(() => {
    if (!search) return users;
    const q = search.toLowerCase();
    return users.filter((u) => [u.name, u.email, u.role, u.branch, u.mobile, u.designation].some((v) => String(v || '').toLowerCase().includes(q)));
  }, [users, search]);

  const togglePerm = (permId: string) => {
    setPerms((prev) => prev.includes(permId) ? prev.filter((p) => p !== permId) : [...prev, permId]);
  };

  const toggleUserPerm = async (user: UserAccount, perm: string) => {
    const currentPerms: string[] = user.permissions || ROLE_DEFAULT_PERMISSIONS[user.role] || [];
    const updatedPerms = currentPerms.includes(perm)
      ? currentPerms.filter((p) => p !== perm)
      : [...currentPerms, perm];
    try {
      const res = await fetch(`/api/users/${user.id}/permissions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: updatedPerms }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Permissions updated for ${user.name}`);
      loadUsers();
    } catch {
      toast.error('Could not update user permissions');
    }
  };

  const openEditModal = (u: UserAccount) => {
    setEditUser(u);
    setName(u.name);
    setEmail(u.email);
    setPassword('');
    setRole(u.role);
    setBranch(u.branch || 'Indiranagar');
    setMobile(u.mobile || '');
    setDesignation(u.designation || '');
    setActive(u.active);
    setPerms(u.permissions || ROLE_DEFAULT_PERMISSIONS[u.role] || []);
  };

  const openAddModal = () => {
    setEditUser(null);
    setName(''); setEmail(''); setPassword(''); setMobile('');
    setRole('FRONTDESK'); setBranch('Indiranagar');
    setDesignation('Frontdesk Operations Executive');
    setActive(true);
    setPerms(ROLE_DEFAULT_PERMISSIONS.FRONTDESK);
    setShowAdd(true);
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!name || !email || !role) { toast.error('Name, email, and role are required'); return; }
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password: password || 'pass123', role, branch, mobile: mobile || '9800000000', designation, permissions: perms, active }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'User creation failed'); }
      toast.success(`User account created for ${name} (${role})`);
      setShowAdd(false);
      loadUsers();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create user account');
    }
  };

  const handleEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    try {
      const res = await fetch(`/api/users/${editUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, role, branch, mobile, designation, permissions: perms, active, ...(password ? { password } : {}) }),
      });
      if (!res.ok) throw new Error();
      toast.success(`User ${name} updated successfully`);
      setEditUser(null);
      loadUsers();
    } catch {
      toast.error('Failed to update user');
    }
  };

  const handleDelete = async () => {
    if (!deleteUser) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/users/${deleteUser.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success(`User ${deleteUser.name} deleted`);
      setDeleteUser(null);
      loadUsers();
    } catch {
      toast.error('Failed to delete user');
    } finally {
      setDeleting(false);
    }
  };

  const isAdmin = currentUser.role === 'ADMIN' || currentUser.role === 'SUPER_ADMIN';
  const categories = ['Clinical & Bookings', 'Financials & Ledgers', 'Administrative & Security'] as const;

  const renderUserFormFields = () => (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Full Name *"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dr. Kavita Rao" required /></Field>
      <Field label="Email / System Login ID *"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@oxycare.in" required /></Field>
      <Field label="Mobile Phone Number"><Input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="e.g. 9844556677" /></Field>
      <Field label={editUser ? 'New Password (leave blank to keep)' : 'Initial Login Password'}>
        <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="pass123" />
      </Field>
      <Field label="System Role *">
        <Select value={role} onChange={(e) => handleRoleChange(e.target.value as Role)}>
          <option value="ADMIN">Center Admin</option>
          <option value="DOCTOR">Referring Doctor</option>
          <option value="AGENT">Referral Agent</option>
          <option value="FRONTDESK">Frontdesk Staff</option>
          <option value="SUPER_ADMIN">Super Admin</option>
        </Select>
      </Field>
      <Field label="Designation / Specialization"><Input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="e.g. Senior Pathologist" /></Field>
      <Field label="Assigned Lab Branch">
        <Select value={branch} onChange={(e) => setBranch(e.target.value)}>
          <option value="Oxycare Main Center">Oxycare Main Center</option>
          <option value="Oxycare South Branch">Oxycare South Branch</option>
          <option value="Oxycare North Branch">Oxycare North Branch</option>
          <option value="All Branches">All Branches</option>
        </Select>
      </Field>
      <Field label="Account Status">
        <Select value={active ? 'active' : 'inactive'} onChange={(e) => setActive(e.target.value === 'active')}>
          <option value="active">Active (Granted Access)</option>
          <option value="inactive">Inactive / Suspended</option>
        </Select>
      </Field>
    </div>
  );

  const renderPermissionMatrix = () => (
    <div className="border-t border-border pt-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div>
          <h3 className="font-bold text-sm text-foreground flex items-center gap-2"><Shield size={16} className="text-primary" /> Operational Permissions</h3>
          <p className="text-xs text-muted-foreground">Fine-grained access rights for this user account.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setPerms(ALL_PERMISSIONS.map((p) => p.id))} className="text-xs font-semibold text-primary hover:underline">Select All</button>
          <span className="text-muted-foreground">•</span>
          <button type="button" onClick={() => setPerms([])} className="text-xs font-semibold text-destructive hover:underline">Clear All</button>
          <span className="text-muted-foreground">•</span>
          <button type="button" onClick={() => setPerms(ROLE_DEFAULT_PERMISSIONS[role] || [])} className="text-xs font-semibold text-muted-foreground hover:text-foreground hover:underline">Reset Defaults</button>
        </div>
      </div>
      <div className="space-y-4">
        {categories.map((cat) => {
          const catPerms = ALL_PERMISSIONS.filter((p) => p.category === cat);
          return (
            <div key={cat} className="rounded-2xl border border-border bg-muted/20 p-4">
              <div className="text-xs font-bold text-primary uppercase tracking-wider mb-3">{cat}</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {catPerms.map((p) => {
                  const isChecked = perms.includes(p.id);
                  return (
                    <label key={p.id} className={cx('flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-all', isChecked ? 'border-primary/40 bg-primary/5 shadow-sm' : 'border-border bg-card hover:bg-muted/40')}>
                      <input type="checkbox" checked={isChecked} onChange={() => togglePerm(p.id)} className="mt-0.5 size-4 rounded border-input text-primary focus:ring-primary" />
                      <div>
                        <div className="text-xs font-bold text-foreground">{p.label}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">{p.description}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      <PageTitle
        eyebrow="Admin Controls & Access Matrix"
        title="User Accounts & Granular Permissions"
        detail="Manage center staff, referring doctors, referral agents, and configure detailed operational permissions."
        action={isAdmin && <Button onClick={openAddModal}><Plus size={16} /> Add User Account</Button>}
      />

      <Panel className="p-6">
        <div className="flex flex-col gap-3 border-b border-border pb-4 mb-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users by name, email, designation, role..." className="pl-9" />
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead className="bg-muted/45 text-[10px] uppercase tracking-[.12em] text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-bold">User Name & Profile</th>
                  <th className="px-4 py-3 font-bold">Role & Permissions</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  {isAdmin && <th className="px-4 py-3 font-bold">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-xs font-medium">
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="grid size-9 place-items-center rounded-full bg-primary/10 text-primary font-bold">
                          {initials(u.name)}
                        </div>
                        <div>
                          <div className="font-bold text-foreground text-sm flex items-center gap-2">
                            {u.name}
                            {u.role === 'SUPER_ADMIN' && <span className="mono rounded bg-primary/20 px-1.5 py-0.2 text-[9px] text-primary">Super Admin</span>}
                          </div>
                          <div className="mono text-[11px] text-muted-foreground">{u.email} · {u.mobile || 'No Mobile'}</div>
                          <div className="text-[10px] text-muted-foreground">{u.designation || u.role} · {u.branch || 'All Branches'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 max-w-xs">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="rounded-lg bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                          {u.role}
                        </span>
                        {(u.permissions || ROLE_DEFAULT_PERMISSIONS[u.role] || []).map((p) => (
                          <button key={p} type="button" onClick={() => toggleUserPerm(u, p)} className="rounded bg-muted hover:bg-muted/80 px-2 py-0.5 text-[10px] font-medium text-foreground border border-border" title="Click to toggle permission">
                            {p.replace(/_/g, ' ')}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={cx('rounded-lg px-2 py-1 text-[10px] font-bold', u.active ? statusTone('active') : statusTone('blocked'))}>
                        {u.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditModal(u)}
                            className="grid size-8 place-items-center rounded-lg hover:bg-primary/10 text-primary transition-colors"
                            title="Edit user"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteUser(u)}
                            className="grid size-8 place-items-center rounded-lg hover:bg-destructive/10 text-destructive transition-colors"
                            title="Delete user"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Add User Modal */}
      <ModalPortal isOpen={showAdd} onClose={() => setShowAdd(false)} maxWidth="max-w-3xl">
        <div className="flex shrink-0 items-center justify-between border-b border-border p-6 pb-4 bg-card">
          <div>
            <div className="mono text-[10px] font-bold uppercase tracking-[.18em] text-primary">Provisioning Engine</div>
            <h2 className="text-xl font-bold text-foreground">Add User & Assign Detailed Permissions</h2>
          </div>
          <button type="button" onClick={() => setShowAdd(false)} className="grid size-9 place-items-center rounded-xl hover:bg-muted text-muted-foreground"><X size={18} /></button>
        </div>
        <form onSubmit={handleCreate} className="flex flex-col min-h-0 flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 scrollbar-thin space-y-6">
            {renderUserFormFields()}
            {renderPermissionMatrix()}
          </div>
          <div className="flex shrink-0 justify-end gap-3 border-t border-border bg-muted/20 px-6 py-4">
            <Button type="button" variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button type="submit" className="font-bold">Create User Account</Button>
          </div>
        </form>
      </ModalPortal>

      {/* Edit User Modal */}
      <ModalPortal isOpen={!!editUser} onClose={() => setEditUser(null)} maxWidth="max-w-3xl">
        <div className="flex shrink-0 items-center justify-between border-b border-border p-6 pb-4 bg-card">
          <div>
            <div className="mono text-[10px] font-bold uppercase tracking-[.18em] text-amber-500">Editing Account</div>
            <h2 className="text-xl font-bold text-foreground">Edit User: {editUser?.name}</h2>
          </div>
          <button type="button" onClick={() => setEditUser(null)} className="grid size-9 place-items-center rounded-xl hover:bg-muted text-muted-foreground"><X size={18} /></button>
        </div>
        <form onSubmit={handleEdit} className="flex flex-col min-h-0 flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 scrollbar-thin space-y-6">
            {renderUserFormFields()}
            {renderPermissionMatrix()}
          </div>
          <div className="flex shrink-0 justify-end gap-3 border-t border-border bg-muted/20 px-6 py-4">
            <Button type="button" variant="secondary" onClick={() => setEditUser(null)}>Cancel</Button>
            <Button type="submit" className="font-bold bg-amber-500 hover:bg-amber-600">Save Changes</Button>
          </div>
        </form>
      </ModalPortal>

      {/* Delete Confirmation Dialog */}
      <ModalPortal isOpen={!!deleteUser} onClose={() => setDeleteUser(null)} maxWidth="max-w-md">
        {deleteUser && (
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="grid size-10 place-items-center rounded-full bg-destructive/10 text-destructive"><AlertTriangle size={18} /></div>
              <div>
                <div className="font-bold text-foreground">Delete User Account</div>
                <div className="text-xs text-muted-foreground">This action cannot be undone</div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-5">
              Are you sure you want to permanently delete <span className="font-bold text-foreground">{deleteUser.name}</span> ({deleteUser.email})? Their account and all associated access will be revoked.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setDeleteUser(null)}>Cancel</Button>
              <Button type="button" onClick={handleDelete} disabled={deleting} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-bold">
                {deleting ? 'Deleting...' : 'Yes, Delete'}
              </Button>
            </div>
          </div>
        )}
      </ModalPortal>
    </>
  );
}



// Partner Labs Management & Isolated Test Catalogues Component
function PartnerLabs({ currentUser }: { currentUser: UserAccount }) {
  const [partnerLabs, setPartnerLabs] = useState<PartnerLab[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Lab modal state
  const [showAddLab, setShowAddLab] = useState(false);
  const [editingLab, setEditingLab] = useState<PartnerLab | null>(null);
  const [deleteLab, setDeleteLab] = useState<PartnerLab | null>(null);
  const [deletingLab, setDeletingLab] = useState(false);

  // Lab form fields
  const [labName, setLabName] = useState('');
  const [labAddress, setLabAddress] = useState('');
  const [labCity, setLabCity] = useState('');
  const [labPhone, setLabPhone] = useState('');
  const [labEmail, setLabEmail] = useState('');
  const [labContactPerson, setLabContactPerson] = useState('');
  const [labActive, setLabActive] = useState(true);

  // Test Catalogue Management Modal for a specific lab
  const [managingTestsLab, setManagingTestsLab] = useState<PartnerLab | null>(null);
  const [testSearch, setTestSearch] = useState('');
  const [showAddTest, setShowAddTest] = useState(false);
  const [editingTest, setEditingTest] = useState<PartnerLabTest | null>(null);
  const [deleteTest, setDeleteTest] = useState<PartnerLabTest | null>(null);
  const [deletingTest, setDeletingTest] = useState(false);

  // Test form fields
  const [testName, setTestName] = useState('');
  const [testCode, setTestCode] = useState('');
  const [testCategory, setTestCategory] = useState('Pathology');
  const [testPrice, setTestPrice] = useState('');
  const [testB2bCost, setTestB2bCost] = useState('');
  const [testPartnerShare, setTestPartnerShare] = useState('');
  const [testAgentIncentive, setTestAgentIncentive] = useState('');
  const [testTurnaround, setTestTurnaround] = useState('Same Day');
  const [testSampleType, setTestSampleType] = useState('EDTA Whole Blood');
  const [testInstructions, setTestInstructions] = useState('No special preparation required.');

  const isAdmin = currentUser.role === 'ADMIN' || currentUser.role === 'SUPER_ADMIN';

  const loadLabs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/partner-labs');
      const data = await res.json();
      setPartnerLabs(data);
      if (managingTestsLab) {
        const updated = data.find((l: PartnerLab) => l.id === managingTestsLab.id);
        if (updated) setManagingTestsLab(updated);
      }
    } catch {
      toast.error('Failed to load partner labs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadLabs(); }, []);

  const openAddLabModal = () => {
    setLabName('');
    setLabAddress('');
    setLabCity('');
    setLabPhone('');
    setLabEmail('');
    setLabContactPerson('');
    setLabActive(true);
    setShowAddLab(true);
  };

  const openEditLabModal = (lab: PartnerLab) => {
    setEditingLab(lab);
    setLabName(lab.name);
    setLabAddress(lab.address);
    setLabCity(lab.city || '');
    setLabPhone(lab.phone || '');
    setLabEmail(lab.email || '');
    setLabContactPerson(lab.contactPerson || '');
    setLabActive(lab.active !== false);
  };

  const handleSaveLab = async (e: FormEvent) => {
    e.preventDefault();
    if (!labName.trim() || !labAddress.trim()) {
      toast.error('Lab Name and Address are required.');
      return;
    }

    try {
      if (editingLab) {
        const res = await fetch(`/api/partner-labs/${editingLab.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: labName,
            address: labAddress,
            city: labCity,
            phone: labPhone,
            email: labEmail,
            contactPerson: labContactPerson,
            active: labActive,
          }),
        });
        if (!res.ok) throw new Error();
        toast.success(`Partner lab "${labName}" updated successfully`);
        setEditingLab(null);
      } else {
        const res = await fetch('/api/partner-labs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: labName,
            address: labAddress,
            city: labCity,
            phone: labPhone,
            email: labEmail,
            contactPerson: labContactPerson,
            active: labActive,
          }),
        });
        if (!res.ok) throw new Error();
        toast.success(`Partner lab "${labName}" added successfully`);
        setShowAddLab(false);
      }
      loadLabs();
    } catch {
      toast.error('Failed to save partner lab');
    }
  };

  const handleDeleteLab = async () => {
    if (!deleteLab) return;
    setDeletingLab(true);
    try {
      const res = await fetch(`/api/partner-labs/${deleteLab.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success(`Partner lab "${deleteLab.name}" removed`);
      setDeleteLab(null);
      loadLabs();
    } catch {
      toast.error('Failed to delete partner lab');
    } finally {
      setDeletingLab(false);
    }
  };

  const openAddTestModal = () => {
    setTestName('');
    setTestCode('');
    setTestCategory('Pathology');
    setTestPrice('');
    setTestB2bCost('');
    setTestPartnerShare('');
    setTestAgentIncentive('100');
    setTestTurnaround('Same Day');
    setTestSampleType('EDTA Whole Blood');
    setTestInstructions('No special preparation required.');
    setShowAddTest(true);
  };

  const openEditTestModal = (t: PartnerLabTest) => {
    setEditingTest(t);
    setTestName(t.name);
    setTestCode(t.testCode);
    setTestCategory(t.category || t.department || 'Pathology');
    setTestPrice(String(t.price || ''));
    setTestB2bCost(String(t.b2bCost || ''));
    setTestPartnerShare(String(t.partnerShare || ''));
    setTestAgentIncentive(String(t.agentIncentive || ''));
    setTestTurnaround(t.turnaround || 'Same Day');
    setTestSampleType(t.sampleType || 'EDTA Whole Blood');
    setTestInstructions(t.instructions || 'No special preparation required.');
  };

  const handleSaveTest = async (e: FormEvent) => {
    e.preventDefault();
    if (!managingTestsLab) return;
    if (!testName.trim() || !testPrice) {
      toast.error('Test Name and Patient Price (MRP) are required.');
      return;
    }

    const payload = {
      name: testName.trim(),
      testCode: testCode.trim() || `${testName.slice(0, 3).toUpperCase()}-01`,
      category: testCategory,
      price: Number(testPrice),
      b2bCost: Number(testB2bCost || testPartnerShare || 0),
      partnerShare: Number(testPartnerShare || testB2bCost || 0),
      agentIncentive: Number(testAgentIncentive || 0),
      turnaround: testTurnaround,
      sampleType: testSampleType,
      instructions: testInstructions,
    };

    try {
      if (editingTest) {
        const res = await fetch(`/api/partner-labs/${managingTestsLab.id}/tests/${editingTest.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error();
        toast.success(`Test "${testName}" updated for ${managingTestsLab.name}`);
        setEditingTest(null);
      } else {
        const res = await fetch(`/api/partner-labs/${managingTestsLab.id}/tests`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error();
        toast.success(`Test "${testName}" added to ${managingTestsLab.name}`);
        setShowAddTest(false);
      }
      loadLabs();
    } catch {
      toast.error('Failed to save test for partner lab');
    }
  };

  const handleDeleteTest = async () => {
    if (!managingTestsLab || !deleteTest) return;
    setDeletingTest(true);
    try {
      const res = await fetch(`/api/partner-labs/${managingTestsLab.id}/tests/${deleteTest.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error();
      toast.success(`Test "${deleteTest.name}" deleted from ${managingTestsLab.name}`);
      setDeleteTest(null);
      loadLabs();
    } catch {
      toast.error('Failed to delete test');
    } finally {
      setDeletingTest(false);
    }
  };

  const filteredLabs = useMemo(() => {
    return partnerLabs.filter((l) => {
      if (statusFilter === 'active' && l.active === false) return false;
      if (statusFilter === 'inactive' && l.active !== false) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return [l.name, l.address, l.city, l.phone, l.email, l.contactPerson].some((v) =>
        String(v || '').toLowerCase().includes(q)
      );
    });
  }, [partnerLabs, search, statusFilter]);

  const labTestsList = useMemo(() => {
    if (!managingTestsLab || !Array.isArray(managingTestsLab.tests)) return [];
    if (!testSearch) return managingTestsLab.tests;
    const q = testSearch.toLowerCase();
    return managingTestsLab.tests.filter((t) =>
      [t.name, t.testCode, t.category, t.department, t.sampleType].some((v) =>
        String(v || '').toLowerCase().includes(q)
      )
    );
  }, [managingTestsLab, testSearch]);

  const totalPartnerTestsCount = partnerLabs.reduce((sum, l) => sum + (l.tests?.length || 0), 0);

  // Form Fields render function to guarantee NO focus/space loss
  const renderLabFormFields = () => (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Partner Lab Name *">
        <Input
          value={labName}
          onChange={(e) => setLabName(e.target.value)}
          placeholder="e.g. SRL Reference Lab & Diagnostics"
          required
        />
      </Field>
      <Field label="City / Region">
        <Input
          value={labCity}
          onChange={(e) => setLabCity(e.target.value)}
          placeholder="e.g. Gurugram, NCR"
        />
      </Field>
      <Field label="Complete Lab Address *" className="sm:col-span-2">
        <Input
          value={labAddress}
          onChange={(e) => setLabAddress(e.target.value)}
          placeholder="Building, Sector, Landmark, City, State..."
          required
        />
      </Field>
      <Field label="Contact Person / In-charge">
        <Input
          value={labContactPerson}
          onChange={(e) => setLabContactPerson(e.target.value)}
          placeholder="e.g. Dr. Rajesh Goel"
        />
      </Field>
      <Field label="Phone / Dispatch Hotline">
        <Input
          value={labPhone}
          onChange={(e) => setLabPhone(e.target.value)}
          placeholder="e.g. +91 9811223344"
        />
      </Field>
      <Field label="Dispatch / Escalation Email">
        <Input
          type="email"
          value={labEmail}
          onChange={(e) => setLabEmail(e.target.value)}
          placeholder="orders@partnerlab.com"
        />
      </Field>
      <Field label="Operational Status">
        <Select value={labActive ? 'active' : 'inactive'} onChange={(e) => setLabActive(e.target.value === 'active')}>
          <option value="active">Active (Available for Bookings)</option>
          <option value="inactive">Inactive / Suspended</option>
        </Select>
      </Field>
    </div>
  );

  const renderTestFormFields = () => (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Test Investigation Name *">
        <Input
          value={testName}
          onChange={(e) => setTestName(e.target.value)}
          placeholder="e.g. Complete Blood Count (CBC)"
          required
        />
      </Field>
      <Field label="Test Code *">
        <Input
          value={testCode}
          onChange={(e) => setTestCode(e.target.value)}
          placeholder="e.g. CBC-01"
          required
        />
      </Field>
      <Field label="Category / Department">
        <Select value={testCategory} onChange={(e) => setTestCategory(e.target.value)}>
          <option value="Pathology">Pathology</option>
          <option value="Biochemistry">Biochemistry</option>
          <option value="Microbiology">Microbiology</option>
          <option value="Radiology">Radiology & Scans</option>
          <option value="Cardiology">Cardiology</option>
          <option value="Histopathology">Histopathology</option>
          <option value="Molecular Diagnostics">Molecular Diagnostics</option>
        </Select>
      </Field>
      <Field label="Patient Price / MRP (₹) *">
        <Input
          type="number"
          value={testPrice}
          onChange={(e) => setTestPrice(e.target.value)}
          placeholder="e.g. 500"
          required
        />
      </Field>
      <Field label="Partner Lab Share / B2B Cost (₹) *">
        <Input
          type="number"
          value={testPartnerShare}
          onChange={(e) => setTestPartnerShare(e.target.value)}
          placeholder="e.g. 260"
          required
        />
      </Field>
      <Field label="Referral Agent Incentive (₹)">
        <Input
          type="number"
          value={testAgentIncentive}
          onChange={(e) => setTestAgentIncentive(e.target.value)}
          placeholder="e.g. 100"
        />
      </Field>
      <Field label="Sample Type">
        <Select value={testSampleType} onChange={(e) => setTestSampleType(e.target.value)}>
          <option value="EDTA Whole Blood">EDTA Whole Blood</option>
          <option value="Serum">Serum</option>
          <option value="Fluoride Plasma">Fluoride Plasma</option>
          <option value="Urine Sample">Urine Sample</option>
          <option value="Stool Sample">Stool Sample</option>
          <option value="N/A - Imaging / Scan">N/A - Imaging / Scan</option>
        </Select>
      </Field>
      <Field label="Turnaround Time (TAT)">
        <Select value={testTurnaround} onChange={(e) => setTestTurnaround(e.target.value)}>
          <option value="2 Hours">2 Hours</option>
          <option value="4 Hours">4 Hours</option>
          <option value="Same Day">Same Day</option>
          <option value="24 Hours">24 Hours</option>
          <option value="48 Hours">48 Hours</option>
          <option value="3-5 Days">3-5 Days</option>
        </Select>
      </Field>
      <Field label="Preparation Instructions" className="sm:col-span-2">
        <Input
          value={testInstructions}
          onChange={(e) => setTestInstructions(e.target.value)}
          placeholder="e.g. 10-12 hours fasting required. Morning sample preferred."
        />
      </Field>
    </div>
  );

  return (
    <>
      <PageTitle
        eyebrow="Diagnostic Network & Outsourcing"
        title="Partner Labs & Independent Test Catalogues"
        detail="Manage outsourced partner laboratories, their addresses, and separate individual test catalogues with specific B2B shares."
        action={isAdmin && <Button onClick={openAddLabModal}><Plus size={16} /> Add Partner Lab</Button>}
      />

      {/* Metrics Row */}
      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <Panel className="p-5 flex items-center gap-4">
          <div className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Building2 size={24} />
          </div>
          <div>
            <div className="mono text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Partner Labs</div>
            <div className="text-2xl font-bold text-foreground mt-0.5">{partnerLabs.length}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{partnerLabs.filter((l) => l.active !== false).length} Active partners</div>
          </div>
        </Panel>

        <Panel className="p-5 flex items-center gap-4">
          <div className="grid size-12 place-items-center rounded-2xl bg-[#e5f5f1] text-[#167366]">
            <FlaskConical size={24} />
          </div>
          <div>
            <div className="mono text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Catalogued Lab Tests</div>
            <div className="text-2xl font-bold text-foreground mt-0.5">{totalPartnerTestsCount}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Separate tests managed per lab</div>
          </div>
        </Panel>

        <Panel className="p-5 flex items-center gap-4">
          <div className="grid size-12 place-items-center rounded-2xl bg-amber-500/10 text-amber-700">
            <MapPin size={24} />
          </div>
          <div>
            <div className="mono text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Active Locations</div>
            <div className="text-2xl font-bold text-foreground mt-0.5">
              {new Set(partnerLabs.map((l) => l.city || 'NCR')).size}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">Operational dispatch hubs</div>
          </div>
        </Panel>
      </div>

      <Panel className="p-6">
        {/* Search & Filter Bar */}
        <div className="flex flex-col gap-3 border-b border-border pb-4 mb-5 sm:flex-row sm:items-center justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search partner lab by name, address, city, contact person..."
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-36"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </Select>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-16 rounded-xl" />)}</div>
        ) : filteredLabs.length === 0 ? (
          <div className="py-12 text-center">
            <Building2 className="mx-auto text-muted-foreground/50 mb-3" size={40} />
            <div className="font-bold text-base text-foreground">No Partner Labs Found</div>
            <p className="text-xs text-muted-foreground mt-1">
              {search ? `No partner labs match "${search}"` : 'Get started by adding your first outsourced partner diagnostic laboratory.'}
            </p>
            {isAdmin && !search && (
              <Button onClick={openAddLabModal} className="mt-4"><Plus size={16} /> Add Partner Lab</Button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredLabs.map((lab) => {
              const testCount = lab.tests?.length || 0;
              const isActive = lab.active !== false;
              return (
                <div
                  key={lab.id}
                  className="rounded-2xl border border-border bg-card hover:border-primary/40 transition-all p-5 shadow-sm flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-base text-foreground flex items-center gap-1.5">
                            <Building2 size={18} className="text-primary shrink-0" />
                            <span>{lab.name}</span>
                          </h3>
                        </div>
                        {lab.city && (
                          <span className="mono text-[10px] rounded bg-muted text-muted-foreground px-2 py-0.5 font-bold mt-1 inline-block">
                            {lab.city}
                          </span>
                        )}
                      </div>
                      <span className={cx('rounded-lg px-2 py-0.5 text-[10px] font-bold shrink-0', isActive ? statusTone('active') : statusTone('blocked'))}>
                        {isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    <div className="space-y-2 text-xs text-muted-foreground my-3">
                      <div className="flex items-start gap-2">
                        <MapPin size={14} className="text-primary shrink-0 mt-0.5" />
                        <span className="text-foreground/90">{lab.address}</span>
                      </div>
                      {lab.contactPerson && (
                        <div className="flex items-center gap-2">
                          <UserRound size={14} className="text-muted-foreground shrink-0" />
                          <span>Contact: <strong className="text-foreground">{lab.contactPerson}</strong></span>
                        </div>
                      )}
                      {lab.phone && (
                        <div className="flex items-center gap-2">
                          <Phone size={14} className="text-muted-foreground shrink-0" />
                          <span className="mono">{lab.phone}</span>
                        </div>
                      )}
                      {lab.email && (
                        <div className="flex items-center gap-2">
                          <Mail size={14} className="text-muted-foreground shrink-0" />
                          <span className="mono truncate">{lab.email}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-border mt-3 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="mono text-[11px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-lg flex items-center gap-1">
                        🔬 {testCount} Tests Conducted
                      </span>
                      {isAdmin && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditLabModal(lab)}
                            className="grid size-8 place-items-center rounded-lg hover:bg-primary/10 text-primary transition-colors"
                            title="Edit Partner Lab"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteLab(lab)}
                            className="grid size-8 place-items-center rounded-lg hover:bg-destructive/10 text-destructive transition-colors"
                            title="Delete Partner Lab"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>

                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setManagingTestsLab(lab)}
                      className="w-full text-xs font-bold gap-1.5 h-9 bg-muted/40 hover:bg-primary hover:text-primary-foreground transition-all"
                    >
                      <FlaskConical size={14} />
                      Manage Separate Test Catalogue ({testCount})
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* Add / Edit Partner Lab Modal */}
      <ModalPortal isOpen={showAddLab || !!editingLab} onClose={() => { setShowAddLab(false); setEditingLab(null); }} maxWidth="max-w-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-border p-6 pb-4 bg-card">
          <div>
            <div className="mono text-[10px] font-bold uppercase tracking-[.18em] text-primary">Partner Lab Network</div>
            <h2 className="text-xl font-bold text-foreground">
              {editingLab ? `Edit Lab: ${editingLab.name}` : 'Add New Partner Laboratory'}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => { setShowAddLab(false); setEditingLab(null); }}
            className="grid size-9 place-items-center rounded-xl hover:bg-muted text-muted-foreground"
          >
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSaveLab} className="flex flex-col min-h-0 flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 scrollbar-thin space-y-4">
            {renderLabFormFields()}
          </div>
          <div className="flex shrink-0 justify-end gap-3 border-t border-border bg-muted/20 px-6 py-4">
            <Button type="button" variant="secondary" onClick={() => { setShowAddLab(false); setEditingLab(null); }}>
              Cancel
            </Button>
            <Button type="submit" className="font-bold">
              {editingLab ? 'Save Lab Changes' : 'Create Partner Lab'}
            </Button>
          </div>
        </form>
      </ModalPortal>

      {/* Delete Lab Confirmation Modal */}
      <ModalPortal isOpen={!!deleteLab} onClose={() => setDeleteLab(null)} maxWidth="max-w-md">
        {deleteLab && (
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="grid size-10 place-items-center rounded-full bg-destructive/10 text-destructive">
                <AlertTriangle size={18} />
              </div>
              <div>
                <div className="font-bold text-foreground">Delete Partner Laboratory</div>
                <div className="text-xs text-muted-foreground">This action removes the lab and its isolated test catalogue</div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-5">
              Are you sure you want to delete <strong className="text-foreground">{deleteLab.name}</strong> ({deleteLab.address})?
              Existing appointments booked with this lab will retain historical snapshots.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setDeleteLab(null)}>Cancel</Button>
              <Button
                type="button"
                onClick={handleDeleteLab}
                disabled={deletingLab}
                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-bold"
              >
                {deletingLab ? 'Deleting...' : 'Yes, Delete Lab'}
              </Button>
            </div>
          </div>
        )}
      </ModalPortal>

      {/* Dedicated Test Catalogue Management Modal for a Lab */}
      <ModalPortal isOpen={!!managingTestsLab} onClose={() => { setManagingTestsLab(null); setTestSearch(''); }} maxWidth="max-w-5xl">
        {managingTestsLab && (
          <div className="flex flex-col h-[85vh] max-h-[750px] overflow-hidden">
            <div className="flex shrink-0 items-center justify-between border-b border-border p-6 pb-4 bg-card">
              <div>
                <div className="mono text-[10px] font-bold uppercase tracking-[.18em] text-primary flex items-center gap-2">
                  <Building2 size={13} />
                  <span>{managingTestsLab.name} — Individual Test Catalogue</span>
                </div>
                <h2 className="text-xl font-bold text-foreground mt-0.5">
                  Tests Conducted by {managingTestsLab.name}
                </h2>
                <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                  <MapPin size={12} /> {managingTestsLab.address}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <Button onClick={openAddTestModal} className="h-9 font-bold text-xs gap-1.5">
                    <Plus size={14} /> Add Test to this Lab
                  </Button>
                )}
                <button
                  type="button"
                  onClick={() => { setManagingTestsLab(null); setTestSearch(''); }}
                  className="grid size-9 place-items-center rounded-xl hover:bg-muted text-muted-foreground"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Test search filter */}
            <div className="p-4 border-b border-border bg-muted/20 flex items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
                <Input
                  value={testSearch}
                  onChange={(e) => setTestSearch(e.target.value)}
                  placeholder={`Search ${managingTestsLab.name}'s tests by name, test code, category...`}
                  className="pl-9 h-9 text-xs"
                />
              </div>
              <span className="mono rounded bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary shrink-0">
                {labTestsList.length} Tests Conducted
              </span>
            </div>

            {/* Tests table */}
            <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
              {labTestsList.length === 0 ? (
                <div className="py-16 text-center">
                  <FlaskConical className="mx-auto text-muted-foreground/40 mb-3" size={38} />
                  <div className="font-bold text-sm text-foreground">No Tests in this Lab's Catalogue</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {testSearch ? `No tests match "${testSearch}"` : 'Every partner lab tests should be added separately with its custom pricing.'}
                  </p>
                  {isAdmin && (
                    <Button onClick={openAddTestModal} className="mt-4 text-xs h-9">
                      <Plus size={14} /> Add First Test to {managingTestsLab.name}
                    </Button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-left text-xs min-w-[700px]">
                    <thead className="bg-muted/50 text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                      <tr>
                        <th className="px-4 py-3">Test Code & Investigation</th>
                        <th className="px-3 py-3">Category</th>
                        <th className="px-3 py-3">Sample & TAT</th>
                        <th className="px-3 py-3 text-right">Patient MRP</th>
                        <th className="px-3 py-3 text-right text-[#167366]">Lab Share / Cost</th>
                        <th className="px-3 py-3 text-right text-[#a96816]">Agent Incentive</th>
                        {isAdmin && <th className="px-3 py-3 text-right">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border font-medium">
                      {labTestsList.map((t) => (
                        <tr key={t.id} className="hover:bg-muted/25 transition-colors">
                          <td className="px-4 py-3">
                            <div className="font-bold text-foreground flex items-center gap-1.5">
                              <span>{t.name}</span>
                              <span className="mono rounded bg-primary/10 text-primary px-1.5 py-0.2 text-[9px]">
                                {t.testCode}
                              </span>
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-xs">
                              {t.instructions || 'Standard preparation'}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-bold text-foreground">
                              {t.category || t.department || 'Pathology'}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-[11px] text-muted-foreground">
                            <div>{t.sampleType || 'EDTA Whole Blood'}</div>
                            <div className="text-[10px] text-primary/80 font-mono mt-0.5">TAT: {t.turnaround || 'Same Day'}</div>
                          </td>
                          <td className="px-3 py-3 text-right font-bold text-foreground mono">
                            {money(t.price)}
                          </td>
                          <td className="px-3 py-3 text-right font-bold text-[#167366] mono">
                            {money(t.partnerShare || t.b2bCost || 0)}
                          </td>
                          <td className="px-3 py-3 text-right font-bold text-[#a96816] mono">
                            {money(t.agentIncentive || 0)}
                          </td>
                          {isAdmin && (
                            <td className="px-3 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => openEditTestModal(t)}
                                  className="grid size-7 place-items-center rounded-lg hover:bg-primary/10 text-primary transition-colors"
                                  title="Edit Test"
                                >
                                  <Edit3 size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteTest(t)}
                                  className="grid size-7 place-items-center rounded-lg hover:bg-destructive/10 text-destructive transition-colors"
                                  title="Delete Test"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex shrink-0 justify-between items-center p-4 border-t border-border bg-muted/20 text-xs">
              <span className="text-muted-foreground">
                Assigned to: <strong className="text-foreground">{managingTestsLab.name}</strong>
              </span>
              <Button type="button" variant="secondary" onClick={() => { setManagingTestsLab(null); setTestSearch(''); }}>
                Done
              </Button>
            </div>
          </div>
        )}
      </ModalPortal>

      {/* Add / Edit Test Modal for Selected Partner Lab */}
      <ModalPortal isOpen={showAddTest || !!editingTest} onClose={() => { setShowAddTest(false); setEditingTest(null); }} maxWidth="max-w-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-border p-6 pb-4 bg-card">
          <div>
            <div className="mono text-[10px] font-bold uppercase tracking-[.18em] text-primary">
              {managingTestsLab?.name} Catalogue
            </div>
            <h2 className="text-xl font-bold text-foreground">
              {editingTest ? `Edit Test: ${editingTest.name}` : `Add Test to ${managingTestsLab?.name}`}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => { setShowAddTest(false); setEditingTest(null); }}
            className="grid size-9 place-items-center rounded-xl hover:bg-muted text-muted-foreground"
          >
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSaveTest} className="flex flex-col min-h-0 flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 scrollbar-thin space-y-4">
            {renderTestFormFields()}
          </div>
          <div className="flex shrink-0 justify-end gap-3 border-t border-border bg-muted/20 px-6 py-4">
            <Button type="button" variant="secondary" onClick={() => { setShowAddTest(false); setEditingTest(null); }}>
              Cancel
            </Button>
            <Button type="submit" className="font-bold">
              {editingTest ? 'Save Test Changes' : 'Add Test to Lab'}
            </Button>
          </div>
        </form>
      </ModalPortal>

      {/* Delete Test Confirmation Dialog */}
      <ModalPortal isOpen={!!deleteTest} onClose={() => setDeleteTest(null)} maxWidth="max-w-md">
        {deleteTest && (
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="grid size-10 place-items-center rounded-full bg-destructive/10 text-destructive">
                <AlertTriangle size={18} />
              </div>
              <div>
                <div className="font-bold text-foreground">Remove Test from Lab</div>
                <div className="text-xs text-muted-foreground">Remove from this partner lab's catalogue</div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-5">
              Are you sure you want to remove <strong className="text-foreground">{deleteTest.name}</strong> ({deleteTest.testCode}) from {managingTestsLab?.name}?
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setDeleteTest(null)}>Cancel</Button>
              <Button
                type="button"
                onClick={handleDeleteTest}
                disabled={deletingTest}
                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-bold"
              >
                {deletingTest ? 'Deleting...' : 'Yes, Remove Test'}
              </Button>
            </div>
          </div>
        )}
      </ModalPortal>
    </>
  );
}



// Doctor Pricing Engine Component (with CSV Upload & Separate Partner Share / Incentive)
function DoctorPricing({ currentUser }: { currentUser?: UserAccount }) {
  const isDoctor = currentUser?.role === 'DOCTOR';
  const [doctorPrices, setDoctorPrices] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [tests, setTests] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);

  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [selectedTestId, setSelectedTestId] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [partnerShare, setPartnerShare] = useState('200');
  const [agentIncentive, setAgentIncentive] = useState('100');

  const loadData = async () => {
    setLoading(true);
    try {
      const [dpRes, docRes, testRes] = await Promise.all([
        fetch('/api/doctor-prices'),
        fetch('/api/doctors'),
        fetch('/api/tests'),
      ]);
      setDoctorPrices(await dpRes.json());
      setDoctors(await docRes.json());
      setTests(await testRes.json());
    } catch {
      toast.error('Failed to load doctor pricing configuration');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const filteredPrices = useMemo(() => {
    if (!search) return doctorPrices;
    const q = search.toLowerCase();
    return doctorPrices.filter((dp) =>
      [dp.doctorName, dp.testName, dp.doctorId, dp.testId].some((v) => String(v || '').toLowerCase().includes(q))
    );
  }, [doctorPrices, search]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedDoctorId || !selectedTestId || !customPrice) {
      toast.error('Doctor, Test, and Custom Price are required'); return;
    }
    try {
      const res = await fetch('/api/doctor-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctorId: selectedDoctorId,
          testId: selectedTestId,
          customPrice: Number(customPrice),
          partnerShare: Number(partnerShare),
          agentIncentive: Number(agentIncentive),
        }),
      });
      if (!res.ok) throw new Error('Failed to set price');
      toast.success('Doctor custom rate updated!');
      setShowAdd(false);
      setSelectedDoctorId(''); setSelectedTestId(''); setCustomPrice('');
      loadData();
    } catch {
      toast.error('Could not update doctor custom rate');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/doctor-prices/${id}`, { method: 'DELETE' });
      toast.success('Doctor custom rate deleted');
      loadData();
    } catch {
      toast.error('Could not delete rate');
    }
  };

  return (
    <>
      <PageTitle
        eyebrow="Commercial Management"
        title="Doctor-Specific Pricing"
        detail="Set customized test prices, partner share, and agent incentive rates per referring doctor with bulk CSV import."
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowBulkUpload(true)}><Upload size={16} /> CSV Bulk Upload</Button>
            <Button onClick={() => setShowAdd(true)}><Plus size={16} /> Set Doctor Special Rate</Button>
          </div>
        }
      />
      <Panel className="p-6">
        <div className="flex flex-col gap-3 border-b border-border pb-4 mb-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search doctor pricing by doctor name, test name..."
              className="pl-9"
            />
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left">
              <thead className="bg-muted/45 text-[10px] uppercase tracking-[.12em] text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-bold">Doctor</th>
                  <th className="px-4 py-3 font-bold">Diagnostic Test</th>
                  <th className="px-4 py-3 font-bold text-right">Base Price</th>
                  <th className="px-4 py-3 font-bold text-right">Doctor Special Rate</th>
                  <th className="px-4 py-3 font-bold text-right text-[#167366]">Partner Share</th>
                  {!isDoctor && <th className="px-4 py-3 font-bold text-right text-[#a96816]">Agent Incentive</th>}
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredPrices.map((dp) => (
                  <tr key={dp.id} className="hover:bg-muted/35">
                    <td className="px-5 py-4 font-semibold text-sm">{dp.doctorName}</td>
                    <td className="px-4 py-4 text-xs font-medium">{dp.testName}</td>
                    <td className="px-4 py-4 mono text-xs text-muted-foreground text-right">{money(dp.basePrice)}</td>
                    <td className="px-4 py-4 mono text-xs font-bold text-primary text-right">{money(dp.customPrice)}</td>
                    <td className="px-4 py-4 mono text-xs font-semibold text-[#167366] text-right">{money(dp.partnerShare || 0)}</td>
                    {!isDoctor && <td className="px-4 py-4 mono text-xs font-semibold text-[#a96816] text-right">{money(dp.agentIncentive || 0)}</td>}
                    <td className="px-5 py-4 text-right">
                      <button onClick={() => handleDelete(dp.id)} className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive">
                        <X size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Add Doctor Price Modal */}
      <ModalPortal isOpen={showAdd} onClose={() => setShowAdd(false)} maxWidth="max-w-md">
        <div className="flex shrink-0 items-center justify-between border-b border-border p-6 pb-4 bg-card">
          <h2 className="text-xl font-bold">Set Doctor Special Pricing Rate</h2>
          <button type="button" onClick={() => setShowAdd(false)} className="grid size-8 place-items-center rounded-xl hover:bg-muted text-muted-foreground"><X size={16} /></button>
        </div>
        <form onSubmit={handleSave} className="flex flex-col min-h-0 flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 scrollbar-thin space-y-4">
            <Field label="Referring Doctor *">
              <Select value={selectedDoctorId} onChange={(e) => setSelectedDoctorId(e.target.value)}>
                <option value="">Select Doctor...</option>
                {doctors.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.hospital})</option>)}
              </Select>
            </Field>
            <Field label="Diagnostic Test *">
              <Select value={selectedTestId} onChange={(e) => setSelectedTestId(e.target.value)}>
                <option value="">Select Test...</option>
                {tests.map((t) => <option key={t.id} value={t.id}>{t.name} (Base: ₹{t.price})</option>)}
              </Select>
            </Field>
            <Field label="Doctor Special Price (₹) *">
              <Input type="number" value={customPrice} onChange={(e) => setCustomPrice(e.target.value)} placeholder="e.g. 7000" required />
            </Field>
            <div className={cx('grid gap-3', !isDoctor ? 'grid-cols-2' : 'grid-cols-1')}>
              <Field label="Partner Share (₹)">
                <Input type="number" value={partnerShare} onChange={(e) => setPartnerShare(e.target.value)} placeholder="200" />
              </Field>
              {!isDoctor && (
                <Field label="Agent Incentive (₹)">
                  <Input type="number" value={agentIncentive} onChange={(e) => setAgentIncentive(e.target.value)} placeholder="100" />
                </Field>
              )}
            </div>
          </div>
          <div className="flex shrink-0 justify-end gap-2 p-4 border-t border-border bg-muted/20 px-6">
            <Button type="button" variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button type="submit">Save Special Rate</Button>
          </div>
        </form>
      </ModalPortal>

      {/* CSV Bulk Upload Modal */}
      {showBulkUpload && (
        <CSVBulkUploadModal
          type="doctor_prices"
          onClose={() => setShowBulkUpload(false)}
          onSuccess={() => { setShowBulkUpload(false); loadData(); }}
        />
      )}
    </>
  );
}

// Universal CSV Bulk Upload Modal with Validation & Error Details
function CSVBulkUploadModal({
  type,
  onClose,
  onSuccess
}: {
  type: 'tests' | 'doctor_prices';
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [rawText, setRawText] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [resultSummary, setResultSummary] = useState<any>(null);

  const isTestType = type === 'tests';

  const downloadSampleTemplate = () => {
    let csv = '';
    if (isTestType) {
      csv = 'Test Code,Test Name,Normal Price,Partner Share,Agent Incentive,Instructions,Category\nCBC-01,Complete Blood Count,450,100,50,No special preparation required.,Pathology\nTHY-01,Thyroid Profile,850,200,100,Overnight fasting recommended.,Pathology\nMRI-01,MRI Brain,5200,1000,400,Remove metal objects before scan.,Radiology';
    } else {
      csv = 'Doctor Name,Test Code,Test Name,Doctor Price,Partner Share,Agent Incentive\nDr. Kavita Rao,PET-01,PET CT Scan,7000,1400,500\nDr. Arjun Menon,MRI-01,MRI Brain,4800,950,400';
    }

    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = isTestType ? 'sample_test_prices_instructions.csv' : 'sample_doctor_specific_prices.csv';
    a.click();
  };

  const parseAndValidate = (csvText: string) => {
    setRawText(csvText);
    const lines = csvText.trim().split('\n').filter(Boolean);
    if (lines.length < 2) {
      setValidationErrors(['CSV file must contain a header row and at least 1 data row.']);
      setRows([]);
      return;
    }

    const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
    const parsedRows: any[] = [];
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      const rowObj: Record<string, any> = {};
      headers.forEach((h, idx) => {
        rowObj[h] = cols[idx] || '';
      });

      if (isTestType) {
        const name = String(rowObj['Test Name'] || rowObj['name'] || '').trim();
        const price = Number(rowObj['Normal Price'] || rowObj['price'] || rowObj['MRP']);
        if (!name) errors.push(`Row ${i}: Missing Test Name.`);
        if (isNaN(price) || price <= 0) errors.push(`Row ${i}: Invalid Normal Price.`);
      } else {
        const doc = String(rowObj['Doctor Name'] || rowObj['doctorId'] || '').trim();
        const test = String(rowObj['Test Name'] || rowObj['Test Code'] || rowObj['testId'] || '').trim();
        const customP = Number(rowObj['Doctor Price'] || rowObj['Doctor-specific Price'] || rowObj['customPrice']);
        if (!doc) errors.push(`Row ${i}: Missing Doctor Name or ID.`);
        if (!test) errors.push(`Row ${i}: Missing Test Code or Name.`);
        if (isNaN(customP) || customP < 0) errors.push(`Row ${i}: Invalid Doctor-specific Price.`);
      }

      parsedRows.push(rowObj);
    }

    setRows(parsedRows);
    setValidationErrors(errors);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      parseAndValidate(ev.target?.result as string);
    };
    reader.readAsText(file);
  };

  const handleUploadSubmit = async () => {
    if (validationErrors.length > 0) {
      toast.error('Please fix validation errors before importing.'); return;
    }
    if (rows.length === 0) return;

    setUploading(true);
    try {
      const endpoint = isTestType ? '/api/tests/bulk-upload' : '/api/doctor-prices/bulk-upload';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      const summary = await res.json();
      if (!res.ok) throw new Error(summary.error || 'Bulk import failed');

      setResultSummary(summary);
      toast.success(`Import complete! ${summary.imported} imported, ${summary.updated} updated.`);
    } catch (err: any) {
      toast.error(err.message || 'Import failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <ModalPortal isOpen={true} onClose={onClose} maxWidth="max-w-3xl">
      <div className="flex shrink-0 items-center justify-between border-b border-border p-6 pb-4 bg-card">
        <div>
          <h2 className="text-xl font-bold">CSV Bulk Import — {isTestType ? 'Tests, Prices & Instructions' : 'Doctor-Specific Pricing'}</h2>
          <p className="text-xs text-muted-foreground mt-1">Upload CSV or paste CSV text to bulk insert/update pricing and instructions.</p>
        </div>
        <button onClick={onClose} className="grid size-8 place-items-center rounded-xl hover:bg-muted text-muted-foreground"><X size={16} /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        {resultSummary ? (
          /* Import Result Summary Card */
          <div className="space-y-4">
            <div className="rounded-2xl border border-emerald-300 bg-emerald-500/10 p-5 text-emerald-900">
              <h3 className="font-bold text-base flex items-center gap-2 text-emerald-800">
                <CheckCircle2 size={18} /> Bulk Import Completed Successfully!
              </h3>
              <div className="mt-3 grid grid-cols-4 gap-3 text-center text-xs">
                <div className="rounded-xl bg-card p-2 border border-border font-bold">Total Rows: {resultSummary.totalRows}</div>
                <div className="rounded-xl bg-emerald-100 p-2 border border-emerald-300 font-bold text-emerald-800">Imported: {resultSummary.imported}</div>
                <div className="rounded-xl bg-blue-100 p-2 border border-blue-300 font-bold text-blue-800">Updated: {resultSummary.updated}</div>
                <div className="rounded-xl bg-rose-100 p-2 border border-rose-300 font-bold text-rose-800">Failed: {resultSummary.failed}</div>
              </div>

              {resultSummary.errors && resultSummary.errors.length > 0 && (
                <div className="mt-4 border-t border-emerald-200 pt-3">
                  <div className="text-xs font-bold text-rose-700 mb-1">Failed Row Errors:</div>
                  <ul className="list-disc pl-5 text-xs text-rose-800 space-y-1">
                    {resultSummary.errors.map((e: any, idx: number) => (
                      <li key={idx}>Row {e.row}: {e.error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="flex justify-end pt-2">
              <Button onClick={onSuccess}>Close & Refresh</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Download Template Bar */}
            <div className="flex items-center justify-between rounded-2xl border border-primary/30 bg-primary/5 p-4">
              <div>
                <div className="text-xs font-bold text-foreground">Sample CSV Template</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Download template pre-formatted with expected columns.</div>
              </div>
              <Button variant="secondary" onClick={downloadSampleTemplate} className="gap-1.5 text-xs font-bold">
                <Download size={14} /> Download Template
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="1. Choose CSV File">
                <Input type="file" accept=".csv" onChange={handleFileUpload} className="pt-1.5" />
              </Field>
              <Field label="2. Or Paste CSV Text Directly">
                <textarea
                  rows={3}
                  value={rawText}
                  onChange={(e) => parseAndValidate(e.target.value)}
                  placeholder={isTestType ? "Test Code,Test Name,Normal Price,Partner Share,Agent Incentive,Instructions..." : "Doctor Name,Test Code,Doctor Price,Partner Share,Agent Incentive..."}
                  className="w-full rounded-xl border border-input bg-background p-2 font-mono text-xs outline-none"
                />
              </Field>
            </div>

            {/* Errors display */}
            {validationErrors.length > 0 && (
              <div className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-rose-900 text-xs">
                <div className="font-bold text-rose-800 mb-1.5 flex items-center gap-1.5">
                  <AlertTriangle size={15} /> CSV Format Issues Found:
                </div>
                <ul className="list-disc pl-5 space-y-0.5">
                  {validationErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Parsed Preview Table */}
            {rows.length > 0 && validationErrors.length === 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-bold text-foreground">
                    Parsed Rows ({rows.length} valid items) — Preview first 10:
                  </div>
                </div>
                <div className="max-h-52 overflow-auto rounded-xl border border-border text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-muted/70 text-[10px] uppercase font-bold sticky top-0">
                      <tr>
                        {Object.keys(rows[0] || {}).map((h) => <th key={h} className="px-3 py-2">{h}</th>)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {rows.slice(0, 10).map((r, i) => (
                        <tr key={i} className="hover:bg-muted/30">
                          {Object.values(r).map((v: any, idx) => <td key={idx} className="px-3 py-1.5 truncate max-w-[150px]">{String(v)}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-border">
              <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
              <Button
                onClick={handleUploadSubmit}
                disabled={rows.length === 0 || validationErrors.length > 0 || uploading}
              >
                {uploading ? `Importing ${rows.length} rows...` : `Import ${rows.length} Records`}
              </Button>
            </div>
          </div>
        )}
      </div>
    </ModalPortal>
  );
}

// Tests Catalogue Component (with CSV Upload, Separate Partner Share / Incentive & Instructions)
function Tests({ role }: { role: Role }) {
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('All');
  const [tests, setTests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [viewParamsTest, setViewParamsTest] = useState<any | null>(null);

  // Form State
  const [testCode, setTestCode] = useState('');
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('Pathology');
  const [price, setPrice] = useState('');
  const [partnerShare, setPartnerShare] = useState('100');
  const [agentIncentive, setAgentIncentive] = useState('50');
  const [instructions, setInstructions] = useState('');
  const [parameters, setParameters] = useState<TestParameter[]>([]);

  const loadTests = async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ search, department });
      const res = await fetch(`/api/tests?${q.toString()}`);
      setTests(await res.json());
    } catch {
      toast.error('Failed to load tests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTests(); }, [search, dept]);

  const addParameter = () => {
    setParameters((prev) => [...prev, { id: `p-${Date.now()}`, name: '', unit: '', normalRange: '' }]);
  };

  const updateParameter = (index: number, field: keyof TestParameter, value: string) => {
    setParameters((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const removeParameter = (index: number) => {
    setParameters((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!name || !price) { toast.error('Name and price are required'); return; }
    try {
      await fetch('/api/tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testCode: testCode || `TEST-${Math.floor(100 + Math.random() * 900)}`,
          name,
          department,
          price: Number(price),
          partnerShare: Number(partnerShare || 0),
          agentIncentive: Number(agentIncentive || 0),
          instructions: instructions || 'No special preparation required.',
          parameters: parameters.filter((p) => p.name.trim()),
        }),
      });
      toast.success('Test added to master catalogue');
      setShowAdd(false);
      setName(''); setPrice(''); setInstructions(''); setTestCode(''); setParameters([]);
      loadTests();
    } catch {
      toast.error('Could not add test');
    }
  };

  const isAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(role);

  return (
    <>
      <PageTitle
        eyebrow="Diagnostic Catalogue"
        title="Test Master Catalogue"
        detail="Central catalogue of diagnostic investigations, partner shares, agent incentives, pre-prep instructions, and bulk CSV import."
        action={
          isAdmin && (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setShowBulkUpload(true)}><Upload size={16} /> Bulk CSV Upload</Button>
              <Button onClick={() => setShowAdd(true)}><Plus size={16} /> Add New Test</Button>
            </div>
          )
        }
      />
      <Panel className="p-6">
        <div className="flex flex-col gap-3 border-b border-border pb-4 mb-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Dynamic search by test name, test code, instructions, department..." className="pl-9" />
          </div>
          <Select value={dept} onChange={(e) => setDept(e.target.value)} className="w-[160px] font-bold">
            <option value="All">All Departments</option>
            <option value="Pathology">Pathology</option>
            <option value="Radiology">Radiology</option>
            <option value="Nuclear Medicine">Nuclear Medicine</option>
          </Select>
        </div>

        {loading ? (
          <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
        ) : (
<div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead className="bg-muted/45 text-[10px] uppercase tracking-[.12em] text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-bold">Test Code & Name</th>
                  <th className="px-4 py-3 font-bold">Department</th>
                  <th className="px-4 py-3 font-bold text-right">Normal Price (MRP)</th>
                  <th className="px-4 py-3 font-bold text-right text-[#167366]">Partner Share</th>
                  {role !== 'DOCTOR' && <th className="px-4 py-3 font-bold text-right text-[#a96816]">Agent Incentive</th>}
                  <th className="px-4 py-3 font-bold">Parameters</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tests.map((test) => {
                  const params: TestParameter[] = Array.isArray(test.parameters) ? test.parameters : [];
                  return (
                    <tr key={test.id} className="hover:bg-muted/35">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-sm">{test.name}</div>
                        <div className="mono text-[10px] text-muted-foreground">{test.testCode || test.id}</div>
                        <div className="text-[10px] text-muted-foreground italic mt-0.5 max-w-[200px] truncate">{test.instructions || 'No special prep.'}</div>
                      </td>
                      <td className="px-4 py-4 text-xs font-medium">{test.department}</td>
                      <td className="px-4 py-4 mono text-xs font-bold text-foreground text-right">{money(test.price)}</td>
                      <td className="px-4 py-4 mono text-xs font-bold text-[#167366] text-right">{money(test.partnerShare || 0)}</td>
                      {role !== 'DOCTOR' && <td className="px-4 py-4 mono text-xs font-bold text-[#a96816] text-right">{money(test.agentIncentive || 0)}</td>}
                      <td className="px-4 py-4">
                        {params.length > 0 ? (
                          <div className="flex flex-col gap-1.5">
                            <span className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-primary w-fit">
                              <FlaskConical size={10} /> {params.length} Parameter{params.length !== 1 ? 's' : ''}
                            </span>
                            <button
                              type="button"
                              onClick={() => setViewParamsTest(test)}
                              className="text-[10px] font-semibold text-primary hover:underline text-left"
                            >
                              Read More →
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4"><span className={cx('rounded-lg px-2 py-1 text-[10px] font-bold', statusTone('active'))}>Active</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Single Test Add Modal */}
      <ModalPortal isOpen={showAdd} onClose={() => setShowAdd(false)} maxWidth="max-w-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-border p-6 pb-4 bg-card">
          <h2 className="text-xl font-bold">Add Diagnostic Test</h2>
          <button type="button" onClick={() => setShowAdd(false)} className="grid size-8 place-items-center rounded-full hover:bg-muted text-muted-foreground"><X size={16} /></button>
        </div>
        <form onSubmit={handleAdd} className="flex flex-col min-h-0 flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 scrollbar-thin space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Test Code"><Input value={testCode} onChange={(e) => setTestCode(e.target.value)} placeholder="e.g. CBC-01" /></Field>
              <Field label="Department">
                <Select value={department} onChange={(e) => setDepartment(e.target.value)}>
                  <option value="Pathology">Pathology</option>
                  <option value="Radiology">Radiology</option>
                  <option value="Nuclear Medicine">Nuclear Medicine</option>
                </Select>
              </Field>
            </div>
            <Field label="Test Name *"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Vitamin D3" required /></Field>
            <Field label="Normal Price (MRP ₹) *"><Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="1200" required /></Field>
            <div className={cx('grid gap-3', role !== 'DOCTOR' ? 'grid-cols-2' : 'grid-cols-1')}>
              <Field label="Partner Share (₹)"><Input type="number" value={partnerShare} onChange={(e) => setPartnerShare(e.target.value)} placeholder="200" /></Field>
              {role !== 'DOCTOR' && (
                <Field label="Agent Incentive (₹)"><Input type="number" value={agentIncentive} onChange={(e) => setAgentIncentive(e.target.value)} placeholder="100" /></Field>
              )}
            </div>
            <Field label="Patient Preparation Instructions">
              <Input value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="e.g. Fasting required for 8-12 hours" />
            </Field>

            {/* Parameters Builder */}
            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2"><FlaskConical size={14} className="text-primary" /> Test Parameters</h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Add investigation parameters with normal reference ranges.</p>
                </div>
                <Button type="button" variant="secondary" onClick={addParameter} className="text-xs gap-1.5"><Plus size={12} /> Add Parameter</Button>
              </div>

              {parameters.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border py-4 text-center text-xs text-muted-foreground">
                  No parameters added. Click "Add Parameter" to add test parameters.
                </div>
              ) : (
                <div className="space-y-2">
                  {parameters.map((param, i) => (
                    <div key={param.id} className="grid grid-cols-[1fr_100px_130px_28px] gap-2 items-center rounded-xl border border-border bg-muted/20 px-3 py-2">
                      <input
                        type="text"
                        value={param.name}
                        onChange={(e) => updateParameter(i, 'name', e.target.value)}
                        placeholder="Parameter name (e.g. Hemoglobin)"
                        className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <input
                        type="text"
                        value={param.unit}
                        onChange={(e) => updateParameter(i, 'unit', e.target.value)}
                        placeholder="Unit (g/dL)"
                        className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <input
                        type="text"
                        value={param.normalRange}
                        onChange={(e) => updateParameter(i, 'normalRange', e.target.value)}
                        placeholder="Normal Range"
                        className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <button type="button" onClick={() => removeParameter(i)} className="grid size-7 place-items-center rounded-lg hover:bg-destructive/10 text-destructive">
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  <div className="flex gap-1 text-[10px] text-muted-foreground px-1">
                    <span className="flex-1">Parameter Name</span>
                    <span className="w-[100px]">Unit</span>
                    <span className="w-[130px]">Normal Range</span>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex shrink-0 justify-end gap-2 p-4 border-t border-border bg-muted/20 px-6">
            <Button type="button" variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button type="submit">Add Test {parameters.filter((p) => p.name.trim()).length > 0 && `(${parameters.filter((p) => p.name.trim()).length} params)`}</Button>
          </div>
        </form>
      </ModalPortal>

      {/* Read More — Parameters Detail Modal */}
      <ModalPortal isOpen={!!viewParamsTest} onClose={() => setViewParamsTest(null)} maxWidth="max-w-lg">
        {viewParamsTest && (
          <>
            <div className="flex shrink-0 items-start justify-between border-b border-border p-6 pb-4 bg-card">
              <div>
                <div className="mono text-[10px] font-bold uppercase tracking-[.18em] text-primary">Investigation Profile</div>
                <h2 className="text-lg font-bold text-foreground mt-0.5">{viewParamsTest.name}</h2>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span className="mono">{viewParamsTest.testCode}</span>
                  <span>·</span>
                  <span>{viewParamsTest.department}</span>
                  <span>·</span>
                  <span className="font-bold text-primary">{money(viewParamsTest.price)}</span>
                </div>
              </div>
              <button type="button" onClick={() => setViewParamsTest(null)} className="grid size-8 place-items-center rounded-full hover:bg-muted text-muted-foreground"><X size={16} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
              {viewParamsTest.instructions && (
                <div className="mb-4 rounded-xl border border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground italic">
                  <span className="font-semibold text-foreground not-italic">Patient Preparation: </span>{viewParamsTest.instructions}
                </div>
              )}

              <div>
                <div className="text-xs font-bold text-foreground mb-3 flex items-center gap-2">
                  <FlaskConical size={13} className="text-primary" />
                  Detailed Parameters & Reference Ranges
                </div>
                <div className="overflow-hidden rounded-xl border border-border">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-muted/45 text-[10px] uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2.5 font-bold">Parameter</th>
                        <th className="px-4 py-2.5 font-bold">Unit</th>
                        <th className="px-4 py-2.5 font-bold text-primary">Normal Range</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(viewParamsTest.parameters || []).map((p: TestParameter) => (
                        <tr key={p.id} className="hover:bg-muted/20">
                          <td className="px-4 py-2.5 font-medium">{p.name}</td>
                          <td className="px-4 py-2.5 mono text-muted-foreground">{p.unit || '—'}</td>
                          <td className="px-4 py-2.5 font-semibold text-primary">{p.normalRange || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 justify-end p-4 border-t border-border bg-muted/20 px-6">
              <Button type="button" variant="secondary" onClick={() => setViewParamsTest(null)}>Close</Button>
            </div>
          </>
        )}
      </ModalPortal>

      {/* CSV Bulk Upload Modal */}
      {showBulkUpload && (
        <CSVBulkUploadModal
          type="tests"
          onClose={() => setShowBulkUpload(false)}
          onSuccess={() => { setShowBulkUpload(false); loadTests(); }}
        />
      )}
    </>
  );
}



function WhatsAppComm() {
  const [config, setConfig] = useState({
    enabled: true,
    provider: 'custom_api',
    apiUrl: 'https://api.ultramsg.com/instance98234/messages/chat',
    apiKey: 'um_live_token_778899',
    instanceId: 'instance98234',
    senderNumber: '+91 98765 43210',
    autoSendBooking: true,
    autoSendReport: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'gateway' | 'test' | 'logs' | 'templates'>('gateway');

  // Live test state
  const [testMobile, setTestMobile] = useState('9876543210');
  const [testMessage, setTestMessage] = useState('Hello! Your WhatsApp API integration with Oxycare Diagnostics is successfully verified and active.');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any | null>(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [cfgRes, logRes, tplRes] = await Promise.all([
        fetch('/api/whatsapp/config').then((r) => r.json()),
        fetch('/api/whatsapp/logs').then((r) => r.json()),
        fetch('/api/whatsapp/templates').then((r) => r.json()),
      ]);
      if (cfgRes && cfgRes.id) setConfig(cfgRes);
      if (Array.isArray(logRes)) setLogs(logRes);
      if (Array.isArray(tplRes)) setTemplates(tplRes);
    } catch {
      toast.error('Failed to load WhatsApp engine data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const handleSaveConfig = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error();
      toast.success('WhatsApp API gateway configuration saved successfully!');
      loadAll();
    } catch {
      toast.error('Failed to update API settings');
    } finally {
      setSaving(false);
    }
  };

  const handleTestSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!testMobile || testMobile.length < 8) {
      toast.error('Please enter a valid recipient mobile number');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/whatsapp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mobile: testMobile,
          message: testMessage,
          config,
        }),
      });
      const data = await res.json();
      setTestResult(data);
      toast.success(`WhatsApp message dispatched to ${testMobile}!`);
      loadAll();
    } catch (err: any) {
      toast.error(err.message || 'Live test failed');
    } finally {
      setTesting(false);
    }
  };

  return (
    <>
      <PageTitle
        eyebrow="Integration & Messaging"
        title="WhatsApp API Gateway & Dispatch"
        detail="Directly configure third-party WhatsApp APIs (UltraMsg, WATI, Meta Cloud, Custom Webhook) for automated booking slips, receipts, and live reports."
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={loadAll} className="gap-1.5"><RefreshCw size={14} /> Refresh</Button>
            <Button onClick={() => setActiveTab('test')} className="gap-1.5"><Send size={14} /> Quick Test Message</Button>
          </div>
        }
      />

      {/* Navigation Tabs */}
      <div className="flex gap-2 border-b border-border pb-3 mb-5 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('gateway')}
          className={cx(
            'flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all',
            activeTab === 'gateway' ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted/40 text-muted-foreground hover:bg-muted'
          )}
        >
          <SlidersHorizontal size={14} /> API Credentials & Gateway
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('test')}
          className={cx(
            'flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all',
            activeTab === 'test' ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted/40 text-muted-foreground hover:bg-muted'
          )}
        >
          <Send size={14} /> Live Test Message
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('logs')}
          className={cx(
            'flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all',
            activeTab === 'logs' ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted/40 text-muted-foreground hover:bg-muted'
          )}
        >
          <History size={14} /> Dispatched Logs ({logs.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('templates')}
          className={cx(
            'flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all',
            activeTab === 'templates' ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted/40 text-muted-foreground hover:bg-muted'
          )}
        >
          <FileText size={14} /> Message Templates
        </button>
      </div>

      {loading ? (
        <div className="space-y-4">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}</div>
      ) : activeTab === 'gateway' ? (
        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <Panel className="p-6">
            <div className="flex items-center justify-between border-b border-border pb-4 mb-5">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <MessageSquare className="text-emerald-600" size={20} />
                  WhatsApp Engine Configuration
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">Enter your direct WhatsApp API credentials. Live requests will be dispatched automatically.</p>
              </div>
              <span className={cx('rounded-xl px-3 py-1 text-xs font-bold border', config.enabled ? 'bg-emerald-500/10 text-emerald-700 border-emerald-300' : 'bg-rose-500/10 text-rose-700 border-rose-300')}>
                {config.enabled ? '● Engine Online' : '○ Engine Disabled'}
              </span>
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-5">
              <div className="flex items-center justify-between rounded-2xl border border-border bg-muted/20 p-4">
                <div>
                  <div className="font-bold text-sm">Automated WhatsApp Messaging</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Toggle live background message dispatching across all patient bookings</div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.enabled}
                    onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                    className="size-5 rounded border-border text-primary cursor-pointer"
                  />
                  <span className="text-xs font-bold">{config.enabled ? 'Enabled' : 'Disabled'}</span>
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="API Provider / Service">
                  <Select
                    value={config.provider}
                    onChange={(e) => setConfig({ ...config, provider: e.target.value })}
                  >
                    <option value="custom_api">Custom REST API / Webhook</option>
                    <option value="ultramsg">UltraMsg WhatsApp API</option>
                    <option value="wati">WATI Business Gateway</option>
                    <option value="meta_cloud">Meta WhatsApp Cloud API</option>
                    <option value="twilio">Twilio Programmable WhatsApp</option>
                  </Select>
                </Field>
                <Field label="Sender Phone Number">
                  <Input
                    value={config.senderNumber}
                    onChange={(e) => setConfig({ ...config, senderNumber: e.target.value })}
                    placeholder="+91 98765 43210"
                  />
                </Field>
              </div>

              <Field label="API Endpoint URL (POST destination)">
                <Input
                  value={config.apiUrl}
                  onChange={(e) => setConfig({ ...config, apiUrl: e.target.value })}
                  placeholder="https://api.ultramsg.com/instance98234/messages/chat or https://your-server.com/api/send"
                  required
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Instance ID / Phone Number ID">
                  <Input
                    value={config.instanceId}
                    onChange={(e) => setConfig({ ...config, instanceId: e.target.value })}
                    placeholder="e.g. instance98234 or 1049283472"
                  />
                </Field>

                <Field label="API Key / Bearer Access Token">
                  <div className="relative">
                    <Input
                      type={showKey ? 'text' : 'password'}
                      value={config.apiKey}
                      onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                      placeholder="e.g. um_live_token_778899"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs font-semibold"
                    >
                      {showKey ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </Field>
              </div>

              <div className="border-t border-border pt-4">
                <div className="text-xs font-bold mb-2">Automated Triggers</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex items-center gap-2 rounded-xl border border-border p-3 text-xs cursor-pointer hover:bg-muted/20">
                    <input
                      type="checkbox"
                      checked={config.autoSendBooking}
                      onChange={(e) => setConfig({ ...config, autoSendBooking: e.target.checked })}
                      className="size-4 rounded border-border text-primary cursor-pointer"
                    />
                    <div>
                      <div className="font-semibold">Auto-send Booking Slips</div>
                      <div className="text-[10px] text-muted-foreground">Dispatches instant message upon appointment creation</div>
                    </div>
                  </label>
                  <label className="flex items-center gap-2 rounded-xl border border-border p-3 text-xs cursor-pointer hover:bg-muted/20">
                    <input
                      type="checkbox"
                      checked={config.autoSendReport}
                      onChange={(e) => setConfig({ ...config, autoSendReport: e.target.checked })}
                      className="size-4 rounded border-border text-primary cursor-pointer"
                    />
                    <div>
                      <div className="font-semibold">Auto-send Ready Reports</div>
                      <div className="text-[10px] text-muted-foreground">Sends PDF download link when status becomes Report Ready</div>
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-border">
                <Button type="button" variant="secondary" onClick={() => setActiveTab('test')}>Test Connectivity</Button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving...' : 'Save API Configuration'}
                </Button>
              </div>
            </form>
          </Panel>

          {/* Quick Info & Provider Guide */}
          <div className="space-y-4">
            <Panel className="p-5">
              <h3 className="font-bold text-sm text-foreground flex items-center gap-2 mb-2">
                <CheckCircle2 size={16} className="text-primary" /> Supported Providers
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Oxycare Diagnostics supports any HTTP/JSON WhatsApp API endpoint. Simply paste your instance URL and bearer/API token.
              </p>
              <div className="mt-4 space-y-2 text-xs">
                <div className="rounded-xl border border-border bg-muted/20 p-2.5">
                  <strong className="text-foreground">UltraMsg / WATI:</strong>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Endpoint: <code className="mono">https://api.ultramsg.com/[instance]/messages/chat</code>
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-muted/20 p-2.5">
                  <strong className="text-foreground">Custom Webhook:</strong>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    JSON payload sent: <code className="mono">{"{ to, message, token }"}</code>
                  </div>
                </div>
              </div>
            </Panel>

            <Panel className="p-5">
              <h3 className="font-bold text-sm text-foreground flex items-center gap-2 mb-2">
                <History size={16} className="text-primary" /> Quick Stats
              </h3>
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="rounded-xl border border-border bg-card p-3">
                  <div className="text-[10px] uppercase font-bold text-muted-foreground">Total Dispatched</div>
                  <div className="text-xl font-bold mt-1 text-primary">{logs.length}</div>
                </div>
                <div className="rounded-xl border border-border bg-card p-3">
                  <div className="text-[10px] uppercase font-bold text-muted-foreground">Delivery Rate</div>
                  <div className="text-xl font-bold mt-1 text-emerald-600">99.4%</div>
                </div>
              </div>
            </Panel>
          </div>
        </div>
      ) : activeTab === 'test' ? (
        <Panel className="p-6 max-w-2xl">
          <div className="border-b border-border pb-4 mb-5">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Send className="text-primary" size={18} />
              Dispatch Live WhatsApp Test Message
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Verify your API URL and Token connectivity by dispatching a test notification to your personal mobile number.
            </p>
          </div>

          <form onSubmit={handleTestSend} className="space-y-4">
            <Field label="Recipient Mobile Number (with Country Code) *">
              <Input
                value={testMobile}
                onChange={(e) => setTestMobile(e.target.value)}
                placeholder="e.g. 9876543210 or 919876543210"
                required
              />
            </Field>

            <Field label="Message Text">
              <textarea
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                rows={3}
                className="w-full rounded-xl border border-input bg-background p-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                required
              />
            </Field>

            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
              Target Gateway: <strong className="text-foreground mono">{config.apiUrl || 'No API URL configured'}</strong>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setActiveTab('gateway')}>Back to Gateway</Button>
              <Button type="submit" disabled={testing}>
                {testing ? 'Dispatching...' : 'Send Live Test Message'}
              </Button>
            </div>
          </form>

          {testResult && (
            <div className="mt-5 rounded-2xl border border-emerald-300 bg-emerald-500/10 p-4 text-xs space-y-2 animate-in fade-in">
              <div className="font-bold text-emerald-900 flex items-center gap-1.5">
                <CheckCircle2 size={16} className="text-emerald-700" />
                Live Dispatch Completed!
              </div>
              <div className="text-emerald-800">Status: <strong>{testResult.status}</strong></div>
              <div className="mono text-[11px] text-emerald-800 bg-emerald-100/60 p-2 rounded-lg">{testResult.details}</div>
            </div>
          )}
        </Panel>
      ) : activeTab === 'logs' ? (
        <Panel className="p-6">
          <div className="flex items-center justify-between border-b border-border pb-4 mb-4">
            <div>
              <h2 className="text-base font-bold">Dispatched Message Audit Trail</h2>
              <p className="text-xs text-muted-foreground">Real-time log of notifications triggered by the diagnostic engine.</p>
            </div>
            <Button variant="secondary" onClick={loadAll} className="gap-1.5 text-xs"><RefreshCw size={13} /> Refresh Logs</Button>
          </div>

          {logs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border py-8 text-center text-xs text-muted-foreground">
              No WhatsApp messages recorded yet. Messages sent during appointment bookings will appear here.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Patient / Mobile</th>
                    <th className="px-4 py-3">Message Type</th>
                    <th className="px-4 py-3">Message Content</th>
                    <th className="px-4 py-3">Delivery Status</th>
                    <th className="px-4 py-3">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {logs.map((l) => (
                    <tr key={l.id} className="hover:bg-muted/25">
                      <td className="px-4 py-3">
                        <div className="font-bold text-foreground">{l.patientName}</div>
                        <div className="mono text-[10px] text-muted-foreground mt-0.5">{l.mobile}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="mono rounded bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-bold">
                          {l.type || 'Notification'}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-[320px] text-muted-foreground truncate" title={l.message}>
                        {l.message}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cx('rounded-lg px-2 py-0.5 text-[10px] font-bold border', String(l.status).toLowerCase().includes('delivered') ? 'bg-[#e5f5f1] text-[#167366] border-[#bce4db]' : 'bg-[#fff2dd] text-[#a96816] border-[#f5dfb8]')}>
                          {l.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 mono text-[10px] text-muted-foreground">
                        {new Date(l.timestamp).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((tpl) => (
            <Panel key={tpl.id} className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="mono text-[10px] font-bold uppercase text-primary tracking-wider">{tpl.type}</span>
                <span className="rounded-lg bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 font-bold">Active</span>
              </div>
              <div className="rounded-xl border border-border bg-muted/25 p-3 text-xs text-foreground/85 font-mono leading-relaxed">
                "{tpl.template}"
              </div>
              <div className="text-[10px] text-muted-foreground">
                Variables: <code className="text-primary">{"{{patient_name}}, {{appointment_id}}, {{test_name}}"}</code>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </>
  );
}

// Audit Logs Component with Dynamic Search
function AuditLogs() {
  const [logs, setLogs] = useState<any[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const q = search ? `?search=${encodeURIComponent(search)}` : '';
    fetch(`/api/audit-logs${q}`).then((r) => r.json()).then(setLogs);
  }, [search]);

  return <><PageTitle eyebrow="Security & Compliance" title="Audit Logs" detail="Immutable audit log of user actions, financial balance adjustments, and status updates." />
    <Panel className="p-6">
      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search audit logs by user, role, action, details..." className="pl-9" />
      </div>
      <div className="divide-y divide-border">
        {logs.map((l) => (
          <div key={l.id} className="py-3 text-xs">
            <div className="flex items-center justify-between font-semibold">
              <span>{l.user} ({l.role}) — <span className="text-primary">{l.action}</span></span>
              <span className="mono text-[10px] text-muted-foreground">{new Date(l.timestamp).toLocaleString()}</span>
            </div>
            <div className="text-muted-foreground mt-0.5 font-mono text-[11px]">{l.details ? JSON.stringify(l.details) : l.entity}</div>
          </div>
        ))}
      </div>
    </Panel>
  </>;
}

// Secure Oxycare Authentication Portal
function LoginPage({ onLoginSuccess }: { onLoginSuccess: (user: UserAccount) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password: password.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Invalid email or password');
      }
      const user: UserAccount = await res.json();
      saveUserSession(user);
      toast.success(`Welcome back, ${user.name}!`);
      onLoginSuccess(user);
    } catch (err: any) {
      toast.error(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-[100dvh] place-items-center bg-[#eaf2f4] px-5 py-10">
      <form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-[0_20px_70px_hsl(190_30%_30%_/_0.14)]">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-sidebar text-white shadow-md">
            <Stethoscope size={22} />
          </div>
          <div>
            <div className="font-bold text-lg text-foreground">Oxycare Diagnostics</div>
            <div className="mono text-[9px] uppercase tracking-[.16em] text-muted-foreground">Oxycare Department Operations</div>
          </div>
        </div>

        <div className="mt-8">
          <h1 className="text-2xl font-bold tracking-[-.04em]">Sign in to Console</h1>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            Enter your Oxycare credentials to access the department console.
          </p>
        </div>

        <div className="mt-6 space-y-4">
          <Field label="Email / Staff Login ID *">
            <Input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@oxycare.in"
              required
            />
          </Field>
          <Field label="Password *">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </Field>
        </div>

        <Button type="submit" disabled={loading} className="mt-6 w-full font-bold h-11">
          {loading ? 'Authenticating...' : 'Sign In to Oxycare'} <ArrowUpRight size={16} />
        </Button>
      </form>
    </div>
  );
}

function Router({ currentUser, onLogout, onSwitchUser }: { currentUser: UserAccount; onLogout: () => void; onSwitchUser: (user: UserAccount) => void }) {
  const [matchDetail, paramsDetail] = useRoute('/appointments/:id');

  return <ErrorBoundary>
    <Shell currentUser={currentUser} onLogout={onLogout} onSwitchUser={onSwitchUser}>
      <Switch>
        <Route path="/">{() => <Dashboard currentUser={currentUser} />}</Route>
        <Route path="/appointments">{() => <Appointments currentUser={currentUser} />}</Route>
        <Route path="/appointments/:id">{() => paramsDetail ? <AppointmentDetailPage params={paramsDetail} currentUser={currentUser} /> : <NotFound />}</Route>
        <Route path="/slots" component={SlotsManager} />
        <Route path="/partner-labs">{() => <PartnerLabs currentUser={currentUser} />}</Route>
        <Route path="/doctor-dashboard">{() => <DoctorDashboard currentUser={currentUser} />}</Route>
        <Route path="/referral-portal">{() => <ReferralPortal currentUser={currentUser} />}</Route>
        <Route path="/patients" component={Patients} />
        <Route path="/users">{() => <UserAccounts currentUser={currentUser} />}</Route>
        <Route path="/doctor-pricing">{() => <DoctorPricing currentUser={currentUser} />}</Route>
        <Route path="/new-appointment">{() => <NewAppointment currentUser={currentUser} />}</Route>
        <Route path="/tests">{() => <Tests role={currentUser.role} />}</Route>
        <Route path="/whatsapp" component={WhatsAppComm} />
        <Route path="/audit-logs" component={AuditLogs} />
        <Route component={NotFound} />
      </Switch>
    </Shell>
  </ErrorBoundary>;
}

function App() {
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => {
    if (typeof window === 'undefined') return null;
    const stored = localStorage.getItem('diagnostic-user-session') || sessionStorage.getItem('diagnostic-user-session');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.email && !parsed.email.includes('nivara.health') && parsed.name !== 'Admin Priya') {
          return parsed;
        }
      } catch {}
    }
    return null;
  });

  const handleSetUser = (user: UserAccount | null) => {
    saveUserSession(user);
    setCurrentUser(user);
  };

  const logout = () => {
    saveUserSession(null);
    setCurrentUser(null);
  };

  return <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        {currentUser ? (
          <Router currentUser={currentUser} onLogout={logout} onSwitchUser={handleSetUser} />
        ) : (
          <LoginPage onLoginSuccess={handleSetUser} />
        )}
      </WouterRouter>
      <Toaster />
    </TooltipProvider>
  </QueryClientProvider>;
}

export default App;