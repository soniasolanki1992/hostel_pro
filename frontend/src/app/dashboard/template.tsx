'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { Container, useResponsive } from '@/components/layout';
import { Card } from '@/components/data/Card';
import { Button } from '@/components/shadcn/button-extended';
import { Menu, X, LayoutDashboard, Wallet, CalendarDays, BedDouble, FileText, LogOut, FileCheck, Settings, ShieldAlert, History, BookOpen, BarChart3, Users, Lock, Hourglass, GraduationCap } from 'lucide-react';
import { LanguageToggle } from '@/components/LanguageToggle';
import { cn } from '@/components/utils';
import { useLanguage } from '@/contexts/LanguageContext';


interface DashboardTemplateProps {
  title?: string;
  children?: React.ReactNode;
}

const ROLE_DASHBOARD_MAP: Record<string, string> = {
  STUDENT: '/dashboard/student',
  SUPERINTENDENT: '/dashboard/superintendent',
  TRUSTEE: '/dashboard/trustee',
  ACCOUNTS: '/dashboard/accounts',
  PARENT: '/dashboard/parent',
};

const ResponsiveDashboardTemplate: React.FC<DashboardTemplateProps> = ({
  children,
}) => {
  const { t } = useLanguage();
  const { isMobile, isDesktop } = useResponsive();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [authorized, setAuthorized] = useState(true);
  const pathname = usePathname();
  const router = useRouter();

  // Role-based access control: redirect if user accesses wrong dashboard
  React.useEffect(() => {
    // Parent uses a separate OTP-based sessionToken flow, not the JWT/userRole flow
    if (pathname.startsWith('/dashboard/parent')) {
      const sessionToken = new URLSearchParams(window.location.search).get('sessionToken')
        || localStorage.getItem('parentSessionToken');
      if (!sessionToken) {
        router.push('/login/parent');
      }
      return;
    }

    const role = localStorage.getItem('userRole');
    if (!role) {
      router.push('/login');
      return;
    }
    const allowedPath = ROLE_DASHBOARD_MAP[role];
    if (allowedPath && !pathname.startsWith(allowedPath)) {
      setAuthorized(false);
      router.push(allowedPath);
    }
  }, [pathname, router]);

  const handleLogout = async () => {
    if (pathname.startsWith('/dashboard/parent')) {
      localStorage.removeItem('parentSessionToken');
      router.push('/login/parent');
      return;
    }

    // Call server to invalidate sessions
    const token = localStorage.getItem('authToken');
    if (token) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
      } catch {
        // Proceed with client-side logout even if server call fails
      }
    }

    // Clear all auth data from localStorage
    localStorage.removeItem('authToken');
    localStorage.removeItem('userId');
    localStorage.removeItem('userRole');
    router.push('/login');
  };

  const getNavigationItems = (path: string) => {
    if (path.startsWith('/dashboard/student')) {
      return [
        { label: 'Overview', href: '/dashboard/student', icon: <LayoutDashboard className="w-4 h-4" /> },
        { label: 'Fees', href: '/dashboard/student/fees', icon: <Wallet className="w-4 h-4" /> },
        { label: 'Leave', href: '/dashboard/student/leave', icon: <CalendarDays className="w-4 h-4" /> },
        { label: 'Room', href: '/dashboard/student/room', icon: <BedDouble className="w-4 h-4" /> },
        { label: 'Documents', href: '/dashboard/student/documents', icon: <FileText className="w-4 h-4" /> },
        { label: 'Renewal', href: '/dashboard/student/renewal', icon: <History className="w-4 h-4" /> },
        { label: 'Exit', href: '/dashboard/student/exit', icon: <LogOut className="w-4 h-4" /> },
        { label: 'Manual', href: '/dashboard/student/manual', icon: <BookOpen className="w-4 h-4" /> },
        { label: 'Change Password', href: '/dashboard/student/change-password', icon: <Lock className="w-4 h-4" /> },
      ];
    } else if (path.startsWith('/dashboard/superintendent')) {
      return [
        { label: t('Applications', 'आवेदन'), href: '/dashboard/superintendent', icon: <LayoutDashboard className="w-4 h-4" /> },
        { label: t('Interviews', 'साक्षात्कार'), href: '/dashboard/superintendent/interviews', icon: <CalendarDays className="w-4 h-4" /> },
        { label: t('Waitlist', 'प्रतीक्षा सूची'), href: '/dashboard/superintendent/waitlist', icon: <Hourglass className="w-4 h-4" /> },
        { label: t('Residents', 'निवासी'), href: '/dashboard/superintendent/residents', icon: <Users className="w-4 h-4" /> },
        { label: t('Rooms', 'कमरे'), href: '/dashboard/superintendent/rooms', icon: <BedDouble className="w-4 h-4" /> },
        { label: t('Leaves', 'अवकाश'), href: '/dashboard/superintendent/leaves', icon: <CalendarDays className="w-4 h-4" /> },
        { label: t('Clearance', 'मंजूरी'), href: '/dashboard/superintendent/clearance', icon: <FileCheck className="w-4 h-4" /> },
        { label: t('Renewal', 'नवीनीकरण'), href: '/dashboard/superintendent/renewal', icon: <History className="w-4 h-4" /> },
        { label: t('Alumni', 'पूर्व छात्र'), href: '/alumni/admin', icon: <GraduationCap className="w-4 h-4" /> },
        { label: t('Audit', 'लेखा परीक्षा'), href: '/dashboard/superintendent/audit', icon: <ShieldAlert className="w-4 h-4" /> },
        { label: t('Settings', 'सेटिंग्स'), href: '/dashboard/superintendent/config', icon: <Settings className="w-4 h-4" /> },
      ];
    } else if (path.startsWith('/dashboard/trustee')) {
      return [
        { label: t('Overview', 'अवलोकन'), href: '/dashboard/trustee', icon: <LayoutDashboard className="w-4 h-4" /> },
        { label: t('Applications', 'आवेदन'), href: '/dashboard/trustee/applications', icon: <FileText className="w-4 h-4" /> },
        { label: t('Residents', 'निवासी'), href: '/dashboard/trustee/residents', icon: <Users className="w-4 h-4" /> },
        { label: t('Interviews', 'साक्षात्कार'), href: '/dashboard/trustee/interviews', icon: <CalendarDays className="w-4 h-4" /> },
        { label: t('Allocations', 'आवंटन'), href: '/dashboard/trustee/allocations', icon: <BedDouble className="w-4 h-4" /> },
        { label: t('Alumni', 'पूर्व छात्र'), href: '/alumni/admin', icon: <GraduationCap className="w-4 h-4" /> },
        { label: t('Reports', 'रिपोर्ट'), href: '/dashboard/trustee/reports', icon: <BarChart3 className="w-4 h-4" /> },
      ];
    } else if (path.startsWith('/dashboard/accounts')) {
      return [
        { label: t('Overview', 'अवलोकन'), href: '/dashboard/accounts', icon: <LayoutDashboard className="w-4 h-4" /> },
      ];
    } else if (path.startsWith('/dashboard/parent')) {
      return [
        { label: t('Overview', 'अवलोकन'), href: '/dashboard/parent', icon: <LayoutDashboard className="w-4 h-4" /> },
        { label: t('Leave', 'अवकाश'), href: '/dashboard/parent/leave', icon: <CalendarDays className="w-4 h-4" /> },
      ];
    }
    return [];
  };

  const navItems = getNavigationItems(pathname);

  const sidebar = (
    <Card padding="md" className="h-full">
      <nav className="space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href ||
            (item.href.split('/').length > 2 && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-2.5 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-navy-50 text-navy-900 border-l-4 border-navy-900"
                  : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
              )}
              onClick={() => isMobile && setSidebarOpen(false)}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>
    </Card>
  );

  const isTopNavRole = pathname.includes('/student') || pathname.includes('/superintendent') || pathname.includes('/trustee') || pathname.includes('/parent') || pathname.includes('/accounts');

  if (!authorized) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Redirecting...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header
        className="px-6 py-4 border-b sticky top-0 z-50 shadow-sm"
        style={{
          backgroundColor: "var(--surface-primary)",
          borderColor: "var(--border-primary)",
        }}
      >
        <div className="w-full flex items-center justify-between">
          <div className="flex items-center gap-4">
            {isMobile && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="mr-2"
              >
                {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
            )}
            
            <div className="flex items-center gap-3">
              <Image
                src="/logo.png"
                alt="Hirachand Gumanji Family Charitable Trust"
                width={48}
                height={48}
                className="h-12 w-auto"
              />
              <div>
                <h1
                  className="text-lg font-semibold"
                  style={{ color: "var(--text-primary)", fontFamily: "var(--font-serif)" }}
                >
                  Hirachand Gumanji Family
                </h1>
                <p className="text-caption">Charitable Trust</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6">
            {/* Desktop Navigation */}
            {isTopNavRole && isDesktop && (
              <nav className="hidden md:flex items-center gap-6">
                {navItems.map((item) => {
                  const isActive = pathname === item.href ||
                    (item.href !== '/dashboard/superintendent' && pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "text-sm font-medium transition-colors hover:text-navy-900",
                        isActive ? "text-navy-900 font-bold" : "text-gray-600"
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            )}

            <LanguageToggle />

            <Button
              variant="ghost"
              size="sm"
              className="text-gray-600 hover:text-red-600 hover:bg-red-50"
              onClick={handleLogout}
            >
              <LogOut className="w-4 h-4 mr-2" />
              {t('Logout', 'लॉगआउट')}
            </Button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar: Show on Desktop for Non-TopNav Roles, or if explicitly opened */}
        {((!isTopNavRole && isDesktop) || sidebarOpen) && navItems.length > 0 && (
          <aside className={`flex-shrink-0 ${isTopNavRole ? 'lg:hidden' : 'hidden lg:block w-64'} sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto p-4 pl-0`}>
             <div className="pl-4 h-full">
               {sidebar}
             </div>
          </aside>
        )}

        {sidebarOpen && isMobile && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="fixed inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
            <div className="relative w-64 bg-white h-full shadow-xl">
              <div className="p-4 border-b flex justify-between items-center">
                <h2 className="font-semibold text-navy-900">Navigation</h2>
                <Button variant="ghost" size="sm" onClick={() => setSidebarOpen(false)}>
                  <X className="w-5 h-5" />
                </Button>
              </div>
              <div className="p-4">
                {sidebar}
              </div>
            </div>
          </div>
        )}

        <main className="flex-1 min-w-0">
          <Container className="py-6" size="full">
            {children}
          </Container>
        </main>
      </div>
    </div>
  );
};

export default ResponsiveDashboardTemplate;
