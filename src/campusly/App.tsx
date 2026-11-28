import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './campusly.css'
import './roadmap-refresh.css'
import feeReceiptLogo from '@/assets/skillai-fee-logo.png'
import NeuralBackground from './NeuralBackground.tsx'
import RoadmapAiIcons from './RoadmapAiIcons.tsx'
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Award, Bell, BookOpen,
  CalendarDays, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ClipboardList,
  Clock3, Download, FileText, GraduationCap, LayoutDashboard, LogOut, MessageSquare,
  MoreHorizontal, Search, Settings2, ShieldCheck, Sparkles, TrendingUp, UserRound, X,
  LayoutGrid, List,
  CircleHelp, CirclePlus, CalendarCheck, ChartNoAxesColumn, BookMarked, FileCheck2, Send,
  ExternalLink, RotateCcw, Mail, Phone, LockKeyhole, Eye, EyeOff, Inbox, Filter, Trophy,
  Building2, BrainCircuit, CloudUpload, CodeXml, Cpu, Database, Network,
} from 'lucide-react'
import { DEMO_USER, USER, findAccount, setCurrentUser, profileKey, loadDemoData, saveDemoData, resetDemoData, EXAM_SLOTS, FEES, getFeesForCourses, getFeeDueNotifications, getClassTestNotifications, getCurrentCourse, getProgressCourse, getClassTestGrandfatheredThrough, getFirstMissingPreviousModuleTest, getMissingClassTestsForModule, getFirstMissingClassTestForModule, getPublishedModuleMarks, isClassTestFailureClearedByProgress } from './data.ts'
import { loadBatches, studentBatches, getBatchSessionNotifications, getCalendarSessionsForDate, getNextStudentClassDate, BATCH_STORAGE_KEY, BATCH_STORE_CHANGE_EVENT, fmtTime, endTime } from './batches.ts'
import { groupNotificationsByDate, setNotificationReadState, type PortalNotification } from './notificationUtils.ts'
import { buildBatchModuleSchedule, getWeekDates, getWeekStart, toDateKey } from './batchSchedule.ts'
import { filterNotificationsByPreferences, normalizeReminderPreferences } from './calendarExport.ts'
import { getPortalReminderEvents } from './reminderUtils.ts'
import { buildFeeReceiptData, downloadFeeReceiptDocx } from './feeReceipt.ts'
import StudentOnboarding from './StudentOnboarding.tsx'
import RetestAction from './RetestAction.tsx'
import { DEMO_PASSWORD_KEY, verifyStudentPassword } from './studentOnboarding.ts'
import { NotebookPen, Wallet, MapPin, Layers, Moon, Sun, Brain, ChartLine, Cloud, PieChart, Workflow, ScanEye, Bot, WandSparkles, Rocket } from 'lucide-react'

const MODULE_AI_ICONS = { 1: Brain, 2: Database, 3: ChartLine, 4: Cloud, 5: PieChart, 6: Workflow, 7: ScanEye, 8: Bot, 9: WandSparkles, 10: Rocket }

const LOGIN_ONBOARDING_KEY = 'campusly-login-onboarding-step'
const LOGIN_DODGE_PATH = [
  { x: -0.78, y: 0.18 },
  { x: 0.78, y: -0.18 },
  { x: -0.42, y: -0.24 },
  { x: 0.42, y: 0.24 },
]

function ThemeToggle() {
  const [dark, setDark] = useState(false)
  useEffect(() => { setDark(localStorage.getItem('portal-theme') === 'dark') }, [])
  useEffect(() => { document.documentElement.classList.remove('portal-dark') }, [])
  const toggle = () => { const next = !dark
    setDark(next)
    localStorage.setItem('portal-theme', next ? 'dark' : 'light') }
  return (
    <button className="icon-button" onClick={toggle} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} title={dark ? 'Light mode' : 'Dark mode'}>{dark ? <Sun size={19}/> : <Moon size={19}/>}</button>
  )
}
function Reveal({ children, delay = 0 }) {
  const [node, setNode] = useState(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!node) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true)
          obs.disconnect() }
    }, { threshold: 0.12 },
    )
    obs.observe(node)
    return () => obs.disconnect()
  }, [node])
  return (
    <div ref={setNode} className={cx('reveal', visible && 'reveal-in')} style={{ transitionDelay: `${delay}ms` }}>{children}</div>
  )
}
import { lessonTest, moduleAssessment, scoreTest, QUESTIONS_PER_TEST, didPassClassTest, formatLocalDateKey, getRetestWindowState, isClassTestPassed, localDateKey, nextTestAttemptNumber, appendTestAttemptHistory } from './classTests.ts'
import { MODULE_ROADMAP } from './sessions.ts'
import { MyBatch } from './BatchSystem.tsx'
import { Button } from '@/components/ui/button'
import StudentProfile from './Profile.tsx'
import CertificateRequest from './CertificateRequest.tsx'
import Feedback from './Feedback.tsx'
import HubDashboard from './HubDashboard.tsx'
import SessionQuestMap from './SessionQuestMap.tsx'
import Resume from './Resume.tsx'
import BottomNav from './BottomNav.tsx'
import { PortalNavigation, usePortalState, useResetNavigation, usePortalNavigationGuard } from './navigation.tsx'
import { useCloudAuth } from '@/components/auth-provider'
import { supabase } from '@/integrations/supabase/client'
import { sendPasswordReset, signInWithEmail } from './cloudAuth'
import { RUNNER_SCROLL_IDLE_MS, shouldRunnerMove, getScrollDirection, getRoadConstruction } from './roadmapRunnerMotion.ts'
import { scrollToCurrentRoadmapModule } from './roadmapNavigation.ts'
import './theme.css'
import './skillai-polish.css'
import './motion.css'

const RoadmapStudent = lazy(() => import('./RoadmapStudent.tsx'))

const navGroups = [
  { label: 'LEARNING', items: [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'courses', label: 'My Course', icon: BookOpen },
    { id: 'materials', label: 'Study Materials', icon: BookMarked },
    { id: 'timetable', label: 'Timetable', icon: CalendarDays },
  ],
  },
  { label: 'ACADEMICS', items: [
    { id: 'attendance', label: 'Attendance', icon: CalendarCheck },
    { id: 'marks', label: 'Marks & Results', icon: ChartNoAxesColumn },
    { id: 'classtests', label: 'Class Tests', icon: FileCheck2 },
    { id: 'exams', label: 'Exam Slots', icon: NotebookPen },
    { id: 'leave', label: 'Leave Applications', icon: FileCheck2 },
    { id: 'certrequest', label: 'Certificate Request', icon: Award },
    { id: 'feedback', label: 'Feedback', icon: MessageSquare },
  ],
  },
  { label: 'CAREER', items: [
    { id: 'resume', label: 'My Resume', icon: FileText }] },
  { label: 'FINANCE', items: [
    { id: 'fees', label: 'Fees & Payments', icon: Wallet }] },
  { label: 'INSTITUTE', items: [
    { id: 'about', label: 'About Institute', icon: Building2 }] },
]

const titles = {
  get dashboard() { return [`Welcome, ${(USER.name || 'there').split(' ')[0]} 👋`, 'Here’s what’s happening with your learning today.'] },
  courses: ['My Course', 'Explore every module, lesson, and skill in your programme.'],
  materials: ['Study Materials', 'Everything you need to keep learning in one place.'],
  timetable: ['Class Timetable', 'Plan your week and stay on top of every session.'],
  attendance: ['Attendance', 'Track your class participation and attendance record.'],
  marks: ['Marks & Results', 'Your marks are published module-wise, once each module ends.'],
  batch: ['My Batch & Sessions', 'Your batch, class timings and session progress.'],
  classtests: ['Class Tests', 'Take a 10-question test after each lesson and see your score.'],
  exams: ['Exam Slots', 'Your upcoming exam dates, times and venues.'],
  fees: ['Fees & Payments', 'See what is paid and what is still pending.'],
  certrequest: ['Certificate Request', 'Submit a certificate request and track its approval status.'],
  leave: ['Leave Applications', 'Apply for leave and follow your request status.'],
  feedback: ['Feedback', 'Share feedback about your course and lessons.'],
  certificates: ['Certificates', 'View your achievements and completion certificates.'],
  notifications: ['Notifications', 'Stay up to date with your learning activity.'],
  profile: ['My Profile', 'Manage your personal and student information.'],
  resume: ['My Resume', 'Build a resume from skills in your completed course modules.'],
  about: ['About Institute', 'Learn more about your institute, its learning environment, and how to get in touch.'],
}
const roadmapAccents = ['#2572bf', '#4a73af', '#e77b46', '#159c87', '#db5d23', '#3c7ec5', '#4b75b2', '#419897', '#d88125', '#496c9f']
// Road order on the course map: false shows Module 01 at the bottom so the student climbs
// from Module 01 up to Module 10 (top) as the page scrolls down.
const ROADMAP_TOP_FIRST = false
const moduleJourneyAccents = ['#22c979', '#51b6b5', '#418bd9', '#79c943', '#20bd91', '#42a1a1', '#4d8dd3', '#24b982', '#6588bd', '#38bd70']

function cx(...values) { return values.filter(Boolean).join(' ') }
function portalFeeNotifications(data) {
  return getFeeDueNotifications(data, USER.email === DEMO_USER.email ? FEES : [])
}
function portalNotifications(data) {
  const notifications = Array.isArray(data.notifications) ? data.notifications : []
  return filterNotificationsByPreferences([
    ...getClassTestNotifications(data),
    ...portalFeeNotifications(data),
    ...getBatchSessionNotifications(loadBatches(), USER.email, data.batchNotificationReads),
    ...notifications,
  ], data.reminderPreferences)
}
function percent(score, total) { return total ? Math.round((score / total) * 100) : 0 }
function initials(name = '') { return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase() }
function getGrade(p) { return p >= 90 ? 'A+' : p >= 80 ? 'A' : p >= 70 ? 'B+' : p >= 60 ? 'B' : p >= 50 ? 'C' : 'Needs work' }
function todayLabel() { return new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date()) }
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
function todayShort() { return DAY_SHORT[new Date().getDay()] }
// How many more classes can be missed while staying at or above 75%, or how many must be attended to get back.
export function attendanceBuffer(present, total, min = 0.75) {
  if (total === 0) return { safe: true, count: 0 }
  if (present / total >= min) return { safe: true, count: Math.floor(present / min - total) }
  return { safe: false, count: Math.ceil((min * total - present) / (1 - min)) }
}
function toMinutes(t) { const m = /(\d+):(\d+)\s*(AM|PM)/i.exec(t || '')
  if (!m) return 0
  let h = +m[1] % 12
  if (m[3].toUpperCase() === 'PM') h += 12
  return h * 60 + +m[2] }
function nextClass(timetable, now = new Date()) {
  const order = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  const todayIdx = order.indexOf(DAY_SHORT[now.getDay()])
  const mins = now.getHours() * 60 + now.getMinutes()
  for (let off = 0; off < 7; off++) {
    const idx = todayIdx < 0 ? off : todayIdx + off
    if (idx >= order.length) break
    const d = timetable.find((t) => t.day === order[idx])
    if (!d) continue
    const c = d.classes.find((c) => off > 0 || toMinutes(c.time) + 60 > mins)
    if (c) return { ...c, day: d.day, date: d.date, when: off === 0 ? (toMinutes(c.time) <= mins ? 'Happening now' : 'Today') : off === 1 ? 'Tomorrow' : d.day,
      }
  }
  return null
}
export function Login({ onLogin, previewMode }) {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [loginCtaPosition, setLoginCtaPosition] = useState({ x: 0, y: 0 })
  const [loginCtaDodgeStep, setLoginCtaDodgeStep] = useState(0)
  const lastLoginDodge = useRef(-Infinity)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [forgot, setForgot] = useState(false)
  const [sent, setSent] = useState(false)
  const loginCtaUnlocked = Boolean(identifier.trim() && (forgot || password.length))
  const loginCtaOffset = loginCtaUnlocked ? { x: 0, y: 0 } : loginCtaPosition
  const loginCtaTetherLength = Math.hypot(loginCtaOffset.x, loginCtaOffset.y)
  const loginCtaTetherAngle = Math.atan2(loginCtaOffset.y, loginCtaOffset.x) * (180 / Math.PI)
  const loginCtaDisplaced = loginCtaTetherLength > 0
  async function verifyDemoPassword(candidate) {
    const savedPassword = localStorage.getItem(DEMO_PASSWORD_KEY)
    if (!savedPassword) return candidate === DEMO_USER.password
    if (await verifyStudentPassword(candidate, savedPassword)) return true
    if (candidate !== DEMO_USER.password) return false
    localStorage.removeItem(DEMO_PASSWORD_KEY)
    return true
  }
  function dodgeLoginCta(e) {
    if (
      forgot ||
      loginCtaUnlocked ||
      busy ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) return
    const dock = e.currentTarget.closest('.login-cta-dock')
    if (!dock) return
    const button = dock.querySelector('button')
    if (!button) return
    const buttonBounds = button.getBoundingClientRect()
    const distance = Math.hypot(
      e.clientX - (buttonBounds.left + buttonBounds.width / 2),
      e.clientY - (buttonBounds.top + buttonBounds.height / 2),
    )
    const now = performance.now()
    if (e.type !== 'click' && (distance > 68 || now - lastLoginDodge.current < 380)) return
    const dockBounds = dock.getBoundingClientRect()
    const move = LOGIN_DODGE_PATH[loginCtaDodgeStep % LOGIN_DODGE_PATH.length]
    const maxX = Math.max(0, (dockBounds.width - buttonBounds.width) / 2 - 8)
    const maxY = Math.max(0, (dockBounds.height - buttonBounds.height) / 2 - 3)
    lastLoginDodge.current = now
    setLoginCtaPosition({ x: move.x * maxX, y: move.y * maxY })
    setLoginCtaDodgeStep((step) => step + 1)
  }
  function handleLoginCtaClick(e) {
    if (
      forgot ||
      loginCtaUnlocked ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) return
    e.preventDefault()
    dodgeLoginCta(e)
  }
  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (forgot && previewMode) {
        setError('Password reset will be available after the portal is connected to its account service.')
      } else if (previewMode) {
        const registrationNumber = identifier.trim().toLowerCase()
        const isDemoStudent =
          registrationNumber === DEMO_USER.studentId.toLowerCase() ||
          registrationNumber === DEMO_USER.email.toLowerCase()
        const validPassword = isDemoStudent && await verifyDemoPassword(password)
        if (isDemoStudent && validPassword) onLogin({ ...DEMO_USER })
        else setError('Registration number or password is incorrect. Use the demo registration number to preview the portal.')
      } else if (forgot) {
        const { error } = await sendPasswordReset(identifier)
        if (error) setError(error.message)
        else setSent(true)
      } else if (
        identifier.trim().toLowerCase() === DEMO_USER.studentId.toLowerCase() ||
        identifier.trim().toLowerCase() === DEMO_USER.email.toLowerCase()
      ) {
        const validPassword = await verifyDemoPassword(password)
        if (validPassword) onLogin({ ...DEMO_USER })
        else setError('Registration number or password is incorrect.')
      } else {
        const { error } = await signInWithEmail(identifier, password)
        if (error) setError(error.message === 'Invalid login credentials'
          ? 'Email or password is incorrect.'
          : error.message)
      }
    } catch { setError('Could not connect. Please try again.') }
    finally { setBusy(false) }
  }
  return (
    <div className="login-page" style={{ gridTemplateColumns: '1fr' }}>
    <div className="login-bg neural-bg" aria-hidden="true">
      <NeuralBackground/>
      <div className="neural-vignette"/>
    </div>
    <div className="login-main">
      <form className="login-form login-animate" onSubmit={submit}>
        <div className="login-heading"><span className="eyebrow">STUDENT PORTAL</span><h2>{forgot ? 'Forgot password' : 'Welcome back'}</h2>{forgot && <p>Receive a secure password reset link by email.</p>}</div>
        {error && (
            <div className="form-error" role="alert">{error}</div>
          )}
        {sent && <p role="status">If an account exists for this email, you’ll receive a reset link. Check your inbox and spam folder.</p>}
        {!sent && (
            <>
        <label className="field-label" htmlFor="email">{forgot ? 'Email address' : previewMode ? 'Registration number' : 'Email address or demo registration number'}</label>
        <div className="input-wrap"><Mail size={18}/><input id="email" type={forgot ? 'email' : 'text'} value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder={forgot ? 'you@example.com' : previewMode ? 'e.g. MBD-2026-0148' : 'you@example.com or MBD-2026-0148'} required autoComplete="username"/></div>
        {!forgot && (
                <><div className="password-label"><label className="field-label" htmlFor="password">
                      Password
                    </label><Button className="link-button h-auto" variant="link" type="button" onClick={() => { setForgot(true)
                        setError('')
                        setSent(false) }}>
                      Forgot password?
                    </Button></div>
        <div className="input-wrap"><LockKeyhole size={18}/><input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password"/><button className="icon-button input-icon" type="button" aria-label="Toggle password visibility" onClick={() => setShowPassword((v) => !v)}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div>
        </>
              )}
        <div
          className={`login-cta-dock ${loginCtaUnlocked ? 'is-unlocked' : 'is-locked'}${loginCtaDisplaced ? ' is-displaced' : ''}`}
          role="group"
          aria-label={forgot ? 'Password reset action' : 'Sign-in action'}
          onPointerMove={dodgeLoginCta}
        >
          <span className="login-cta-anchor" aria-hidden="true"/>
          <span
            className="login-cta-tether"
            aria-hidden="true"
            style={{
              '--login-tether-length': `${loginCtaTetherLength}px`,
              '--login-tether-angle': `${loginCtaTetherAngle}deg`,
            }}
          />
          <Button
            className="primary-button login-submit h-auto"
            type="submit"
            disabled={busy}
            onClick={handleLoginCtaClick}
            style={{
              '--login-cta-x': `${loginCtaOffset.x}px`,
              '--login-cta-y': `${loginCtaOffset.y}px`,
            }}
          >
            {busy ? 'Please wait…' : forgot ? 'Send reset link' : 'Sign in'} <ArrowRight size={17}/>
          </Button>
        </div>
        </>
          )}
        {forgot ? (
            <Button type="button" variant="link" className="link-button mt-3" onClick={() => { setForgot(false)
                setSent(false)
                setError('') }}>
              Back to sign in
            </Button>
          ) : (
            <>
        <Button type="button" variant="outline" className="secondary-button login-submit h-auto mt-3" disabled={busy} onClick={() => {
                  setIdentifier(previewMode ? DEMO_USER.studentId : DEMO_USER.email)
                  setPassword(DEMO_USER.password)
                  localStorage.removeItem(DEMO_PASSWORD_KEY)
                  setError('')
                  setSent(false)
                }}><GraduationCap size={17}/>Fill demo email and password</Button>
        </>
          )}
              </form>
      <span className="login-version">Student Portal</span>
    </div>
  </div>
  )
}

function Sidebar({ page, setPage, data, onLogout, mobileOpen, setMobileOpen }) {
  const unread = portalNotifications(data).filter((n) => !n.read).length
  return (
    <>
    {mobileOpen && <button className="mobile-scrim" onClick={() => setMobileOpen(false)} aria-label="Close menu"/>}
    <aside className={cx('sidebar', mobileOpen && 'sidebar-open')}>
      <div className="sidebar-brand"><button className="icon-button mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X size={18}/></button></div>
      <nav className="side-nav">{navGroups.map((group) => (
            <div className="nav-group" key={group.label}><div className="nav-group-label">{group.label}</div>{group.items.map((item) => {
        const Icon = item.icon
        const count = item.id === 'notifications' ? unread : item.count
        return (
                  <button key={item.id} className={cx('nav-link', page === item.id && 'active')} onClick={() => { setPage(item.id)
                      setMobileOpen(false) }}><Icon size={18}/><span>{item.label}</span>{count && <span className={cx('nav-count', item.id === 'notifications' && unread > 0 && 'nav-count-alert')}>{count}</span>}</button>
                )
              })}</div>))}</nav>
      <div className="sidebar-bottom"><button className="nav-link logout-link" onClick={onLogout}><LogOut size={18}/><span>Sign out</span></button><button type="button" className="sidebar-user" aria-label="Open student profile" onClick={() => { setPage('profile')
              setMobileOpen(false) }}><span className="avatar avatar-small">{initials(USER.name)}</span><span className="sidebar-user-text"><strong>{USER.name}</strong><span>Student account</span></span><MoreHorizontal size={18}/></button></div>
    </aside>
  </>
  )
}

function ProfileMenu({ setPage, onLogout }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey) }
  }, [open])
  const go = (id) => { setPage(id)
    setOpen(false) }
  return (
    <div className="profile-menu-wrap" ref={ref}>
    <button className={cx('topbar-profile', open && 'is-open')} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu"><div className="avatar">{initials(USER.name)}</div><div><strong>{USER.name}</strong><span>Student</span></div><ChevronDown size={15} className="profile-chevron"/></button>
    {open && (
        <div className="profile-menu" role="menu">
      <div className="profile-menu-head"><div className="avatar">{initials(USER.name)}</div><div><strong>{USER.name}</strong><span>Reg No: {USER.studentId || '—'}</span><span>Batch {USER.batch || '—'}</span></div></div>
      <button role="menuitem" className="profile-menu-item" style={{ animationDelay: '40ms' }} onClick={() => go('profile')}><UserRound size={16}/>
            View full profile
          </button>
      <button role="menuitem" className="profile-menu-item profile-menu-danger" style={{ animationDelay: '80ms' }} onClick={() => { setOpen(false)
              onLogout?.() }}><LogOut size={16}/>
            Sign out
          </button>
    </div>
      )}
  </div>
  )
}

function Topbar({ page, setPage, data, search, setSearch, onLogout }) {
  const unread = portalNotifications(data).filter((n) => !n.read).length
  return (
    <header className="topbar"><div className="topbar-left"><div className="breadcrumb"><span>Workspace</span><ChevronRight size={14}/><strong>{titles[page]?.[0] || 'Dashboard'}</strong></div></div><div className="topbar-actions"><div className="global-search"><Search size={16}/><input type="search" placeholder="Search anything..." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search portal"/><kbd>⌘ K</kbd></div><button className="icon-button notification-button" aria-label="Open notifications" onClick={() => setPage('notifications')}><Bell size={19}/>{unread > 0 && <i/>}</button><div className="topbar-divider"/><ProfileMenu setPage={setPage} onLogout={onLogout}/></div></header>
  )
}

function SectionHeading({ eyebrow, title, subtitle, action, className = '' }) {
  return (
    <div className={cx('section-heading', className)}><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>
  )
}
function Panel({ title, subtitle, action, children, className = '' }) {
  return (
    <section className={cx('panel', className)}><div className="panel-heading"><div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>{action}</div>{children}</section>
  )
}
function ProgressBar({ value, color = 'violet' }) {
  return (
    <div className="progress-track"><div className={cx('progress-fill', `fill-${color}`)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }}/></div>
  )
}
function StatusPill({ children }) {
  const label = String(children)
  const status = label === 'Passed' || label === 'Cleared'
    ? 'passed'
    : label.startsWith('Retest') || label.startsWith('Failed')
      ? 'retest'
      : label.startsWith('Locked')
        ? 'locked'
        : label === 'Available'
          ? 'available'
          : label.toLowerCase().replaceAll(' ', '-')
  return (
    <span className={cx('status-pill', `status-${status}`)}><i/>{children}</span>
  )
}
function EmptyState({ icon: Icon = Inbox, title, text }) {
  return (
    <div className="empty-state"><div><Icon size={23}/></div><strong>{title}</strong><p>{text}</p></div>
  )
}
function StatCard({ icon: Icon, label, value, detail, trend, tone = 'violet', className, watermark: Watermark }) {
  return (
    <div className={cx('stat-card', className)}>{Watermark && <Watermark className="stat-watermark" size={138} aria-hidden="true"/>}<div className="stat-top"><div className={cx('stat-icon', `tone-${tone}`)}><Icon size={19}/></div>{trend && (
          <span className="stat-trend"><ArrowUpRight size={13}/>{trend}</span>
        )}</div><div className="stat-value">{value}</div><div className="stat-label">{label}</div><div className="stat-detail">{detail}</div></div>
  )
}

function TestCelebration({ score, total, kind, onClose }) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, 12000)
    return () => window.clearTimeout(timer)
  }, [onClose])

  const fireworkPositions = [
    { left: '16%', top: '25%' },
    { left: '82%', top: '23%' },
    { left: '50%', top: '12%' },
    { left: '19%', top: '78%' },
    { left: '84%', top: '76%' },
    { left: '32%', top: '48%' },
    { left: '68%', top: '52%' },
    { left: '8%', top: '52%' },
    { left: '92%', top: '48%' },
  ]
  const fireworks = fireworkPositions.map((position, burstIndex) => (
    <div key={burstIndex} className="quiz-celebration-firework" style={position}>
      {Array.from({ length: 32 }, (_, index) => {
        const angle = (Math.PI * 2 * index) / 24
        const distance = 76 + (index % 4) * 22
        return (
          <i
            key={index}
            className="quiz-celebration-particle"
            style={{
              '--particle-x': `${Math.cos(angle) * distance}px`,
              '--particle-y': `${Math.sin(angle) * distance}px`,
              '--particle-angle': `${(angle * 180) / Math.PI + 90}deg`,
              '--particle-delay': `${burstIndex * 110 + (index % 6) * 18}ms`,
            }}
          />
        )
      })}
    </div>
  ))

  return (
    <div className="quiz-celebration-backdrop" role="dialog" aria-modal="true" aria-labelledby="quiz-celebration-title">
      <div className="quiz-celebration-particles" aria-hidden="true">{fireworks}</div>
      <section className="quiz-celebration-card">
        <button type="button" className="quiz-celebration-close" onClick={onClose} aria-label="Close celebration">
          <X size={18}/>
        </button>
        <div className="quiz-celebration-trophy"><Trophy size={35}/></div>
        <span className="quiz-celebration-kicker"><Sparkles size={14}/> VICTORY!</span>
        <h2 id="quiz-celebration-title">{kind === 'assessment' ? 'Assessment cleared!' : 'Test passed!'}</h2>
        <p>You hit the 75% pass mark. Keep that winning streak going!</p>
        <strong className="quiz-celebration-score">{score} / {total} · {percent(score, total)}%</strong>
        <button type="button" className="primary-button" onClick={onClose}>Continue</button>
      </section>
    </div>
  )
}

function Dashboard({ data, batchStore, setPage, onNotificationClick, onOpenClassTest }) {
  return <HubDashboard data={{ ...data, notifications: portalNotifications(data) }} batchStore={batchStore} setPage={setPage} onNotificationClick={onNotificationClick} onOpenClassTest={onOpenClassTest}/>
}

function AboutInstitute() {
  return (
    <div className="page-stack">
    <SectionHeading
      eyebrow="YOUR INSTITUTE"
      title="About the Institute"
      subtitle="Institute details, training focus, and location."
    />
    <section className="about-institute-card panel">
      <div className="about-institute-icon"><Building2 size={26}/></div>
      <div className="about-institute-copy">
        <span className="eyebrow">INSTITUTE PROFILE</span>
        <h3>Skill AI</h3>
        <p>A computer training and skill development institute in Mangalore.</p>
      </div>
      <div className="about-institute-details">
        <div className="about-institute-detail">
          <div className="about-institute-detail-icon"><GraduationCap size={19}/></div>
          <div>
            <h4>Institute Details &amp; Offerings</h4>
            <p>Computer training and skill development.</p>
          </div>
        </div>
        <div className="about-institute-detail">
          <div className="about-institute-detail-icon"><MapPin size={19}/></div>
          <div>
            <h4>Location</h4>
            <address>6th, Paradigm Plaza, Near RTO Office, Old Kent Road, Pandeshwar, Mangalore-575001, Karnataka</address>
          </div>
        </div>
        <div className="about-institute-detail">
          <div className="about-institute-detail-icon"><Mail size={19}/></div>
          <div>
            <h4>Contact</h4>
            <div className="about-institute-contact-links">
              <a href="mailto:Connect@skillaiindia.com">Connect@skillaiindia.com</a>
              <a href="https://skillaiindia.com/" target="_blank" rel="noreferrer">
                  skillaiindia.com <ExternalLink size={14}/>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
  )
}
// eslint-disable-next-line no-unused-vars
function QuickLinks({ setPage }) {
  const items = navGroups.flatMap((g) => g.items).filter((i) => i.id !== 'dashboard')
  return (
    <div className="page-stack"><div className="quick-actions" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12,
        }}>{items.map((i) => { const Icon = i.icon
          return (
            <button key={i.id} onClick={() => { setPage(i.id)
                window.scrollTo(0, 0) }} style={{ minHeight: 96, flexDirection: 'column', justifyContent: 'center' }}><Icon size={24}/>{i.label}</button>
          )
        })}</div></div>
  )
}

function ModuleArtifact({ moduleId }) {
  const prefix = `journey-art-${moduleId}`
  let artwork

  switch (moduleId) {
    case 1:
      artwork = (
        <>
        <path d="M51 18a7 7 0 0 1 7-7h64a7 7 0 0 1 7 7v55H51z" fill={`url(#${prefix}-metal)`} stroke="#57697d" strokeWidth="2"/>
        <rect x="57" y="17" width="60" height="49" rx="3" fill={`url(#${prefix}-screen)`} stroke="#162b42" strokeWidth="1.5"/>
        <path d="M73 40c8-13 22-13 30 0M78 47l8-8 8 8 8-8" fill="none" stroke="#dceaf4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="78" cy="47" r="2.4" fill="var(--module-accent)"/><circle cx="86" cy="39" r="2.4" fill="#ddf7f6"/>
        <circle cx="94" cy="47" r="2.4" fill="var(--module-accent)"/><circle cx="102" cy="39" r="2.4" fill="#ddf7f6"/>
        <path d="M69 25h34" stroke="#d6e3ed" strokeWidth="1" opacity=".5"/>
        <text x="87" y="59" fill="#eaf7ff" fontSize="7" fontWeight="800" textAnchor="middle">
            AI
          </text>
        <path d="M39 76h102l16 16H23z" fill={`url(#${prefix}-metal)`} stroke="#677687" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="m52 79-6 10m18-10-4 10m17-10-2 10m16-10v10m16-10 2 10m16-10 4 10" stroke="#637283" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M76 94h30" stroke="#f8fafc" strokeWidth="2" strokeLinecap="round"/>
        <circle cx="86" cy="71" r="1" fill="#768698"/>
      </>
      )
      break
    case 2:
      artwork = (
        <>
        <path d="m39 24 11-9h84l-10 9z" fill={`url(#${prefix}-metal)`} stroke="#808fa0" strokeWidth="1"/>
        <path d="M39 24h85v56H39z" fill={`url(#${prefix}-screen)`} stroke="#223d5a" strokeWidth="1.5"/>
        <path d="m124 24 10-9v56l-10 9z" fill="#172b41" stroke="#384d65" strokeWidth="1"/>
        <rect x="47" y="31" width="69" height="7" rx="3.5" fill="#3b5067"/>
        <circle cx="52" cy="34.5" r="1.5" fill="var(--module-accent)"/><circle cx="58" cy="34.5" r="1.5" fill="#dceaf4"/>
        <path d="M51 49h17m-17 8h29m-29 8h22m-22 8h38" stroke="#dde7ee" strokeWidth="1.6" strokeLinecap="round" opacity=".82"/>
        <path d="m91 49-6 8 6 8m14-16 6 8-6 8" fill="none" stroke="var(--module-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M101 43h8c4 0 6 2 6 6v5h-10v4h10v5c0 4-2 6-6 6h-8c-4 0-6-2-6-6V49c0-4 2-6 6-6z" fill="#4278b3" stroke="#b8d2f0" strokeWidth="1"/>
        <circle cx="105" cy="48" r="1.5" fill="#eaf4ff"/>
        <path d="M119 62h-8v-5h10c4 0 6 2 6 6v8c0 4-2 6-6 6h-8c-4 0-6-2-6-6v-5h10v-4z" fill="#f3c744"/>
        <circle cx="121" cy="70" r="1.5" fill="#fff9df"/>
        <path d="m31 86 98 0 16 11H17z" fill={`url(#${prefix}-metal)`} stroke="#697889" strokeWidth="1" strokeLinejoin="round"/>
        <path d="M48 89h69m-59 4h48" stroke="#748394" strokeWidth="1.5" strokeLinecap="round"/>
      </>
      )
      break
    case 3:
      artwork = (
        <>
        <path d="M43 89V45m0 44h96" stroke="#65778b" strokeWidth="2" strokeLinecap="round"/>
        <path d="M49 73h86M49 59h86M49 45h86" stroke="#bac6d4" strokeWidth="1" strokeDasharray="2 4" opacity=".65"/>
        <path d="M54 83V67h17v16z" fill={`url(#${prefix}-accent-fill)`}/><path d="m71 67 5-5v21h-5z" fill="#2d445e"/>
        <path d="M82 83V49h17v34z" fill={`url(#${prefix}-accent-fill)`}/><path d="m99 49 5-5v39h-5z" fill="#2d445e"/>
        <path d="M110 83V34h17v49z" fill={`url(#${prefix}-accent-fill)`}/><path d="m127 34 5-5v54h-5z" fill="#2d445e"/>
        <path d="m56 55 25-12 17 4 25-24" fill="none" stroke="#2d445e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="m116 22 8 1-1 8" fill="none" stroke="#2d445e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="56" cy="55" r="3" fill="#eaf7ff" stroke="var(--module-accent)" strokeWidth="1.5"/><circle cx="81" cy="43" r="3" fill="#eaf7ff" stroke="var(--module-accent)" strokeWidth="1.5"/>
        <circle cx="98" cy="47" r="3" fill="#eaf7ff" stroke="var(--module-accent)" strokeWidth="1.5"/><circle cx="123" cy="23" r="3" fill="#eaf7ff" stroke="var(--module-accent)" strokeWidth="1.5"/>
        <path d="M33 95h106" stroke={`url(#${prefix}-metal)`} strokeWidth="5" strokeLinecap="round"/>
      </>
      )
      break
    case 4:
      artwork = (
        <>
        <path d="m90 18 49 18-49 19-49-19z" fill={`url(#${prefix}-accent-fill)`} stroke="#d6e7f2" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="m41 36 49 19v55L41 91z" fill="#223d5a" stroke="#405974" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="m90 55 49-19v55l-49 19z" fill="#142436" stroke="#2f4761" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="m53 38 37 14v39L53 77z" fill="#304864"/>
        <path d="m90 52 37-14v39L90 91z" fill="#223851"/>
        <path d="M68 43 90 52l21-8m-43 19 22 9 21-8" fill="none" stroke="var(--module-accent)" strokeWidth="1.5" opacity=".9"/>
        <path d="M77 46c-4-3-9 0-8 4-4 2-2 8 2 9h15c5-2 4-8 1-9 1-4-4-7-8-4-1-1-1-1-2 0z" fill="#f3f9ff" stroke="#b1c3d7" strokeWidth="1.5"/>
        <path d="M79 47v10m5-9v9m-11-6 6 2m10-2-5 2" fill="none" stroke="var(--module-accent)" strokeWidth="1.4" strokeLinecap="round"/>
        <circle cx="77" cy="50" r="1.6" fill="#eaf7ff"/><circle cx="85" cy="53" r="1.6" fill="var(--module-accent)"/>
        <path d="M54 33v-7m12 11v-8m12 12v-8m24 8v-8m12 4v-8m12 4v-7M41 49h-8m8 13h-8m8 13h-8m106-26h8m-8 13h8m-8 13h8m-84 16v8m14-4v8m14-2v8m14-4v8m14-8v8" stroke="#dbe6ed" strokeWidth="2" strokeLinecap="round"/>
        <path d="m53 36 37 15v40L53 77z" fill="none" stroke="var(--module-accent)" strokeWidth="1.2" opacity=".8"/>
      </>
      )
      break
    case 5:
      artwork = (
        <>
        <path d="M42 19h94a7 7 0 0 1 7 7v58H35V26a7 7 0 0 1 7-7z" fill="#172b41" stroke="#596e85" strokeWidth="2"/>
        <rect x="42" y="26" width="94" height="50" rx="3" fill={`url(#${prefix}-screen)`} stroke="#0c1a2a" strokeWidth="1.5"/>
        <path d="M50 46h77M50 54h77" stroke="#92a4b9" strokeWidth="1" strokeDasharray="2 4" opacity=".5"/>
        <path d="M51 35h34m-34 7h20" stroke="#d7e8f3" strokeWidth="2" strokeLinecap="round"/>
        <path d="M52 68V57h10v11m6 0V49h10v19m6 0V43h10v25" fill={`url(#${prefix}-accent-fill)`}/>
        <path d="M99 62a12 12 0 1 1 18 10l-8-10z" fill="var(--module-accent)"/>
        <path d="M109 51v11l9 7" fill="none" stroke="#eaf7ff" strokeWidth="2" strokeLinecap="round"/>
        <circle cx="109" cy="62" r="2" fill="#eaf7ff"/>
        <path d="M76 84v8m26-8v8m-39 3h53l13 9H55z" fill={`url(#${prefix}-metal)`} stroke="#748394" strokeWidth="1" strokeLinejoin="round"/>
        <path d="M39 106h99" stroke="#223d5a" strokeWidth="4" strokeLinecap="round"/>
      </>
      )
      break
    case 6:
      artwork = (
        <>
        <path d="M37 33h39v28H37z" fill={`url(#${prefix}-screen)`} stroke="#7e8fa1" strokeWidth="1.5"/><path d="m76 33 8-6v28l-8 6z" fill="#142436"/>
        <path d="M95 33h39v28H95z" fill={`url(#${prefix}-screen)`} stroke="#7e8fa1" strokeWidth="1.5"/><path d="m134 33 8-6v28l-8 6z" fill="#18293c"/>
        <path d="M66 79h39v28H66z" fill={`url(#${prefix}-screen)`} stroke="#7e8fa1" strokeWidth="1.5"/><path d="m105 79 8-6v28l-8 6z" fill="#18293c"/>
        <path d="M56 47h39m-9 0 9-8m-9 8 9 8m19 44H56m9-8-9 8 9 8" fill="none" stroke="var(--module-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="56" cy="47" r="4" fill="#eaf7ff" stroke="var(--module-accent)" strokeWidth="1.5"/><circle cx="114" cy="93" r="4" fill="#eaf7ff" stroke="var(--module-accent)" strokeWidth="1.5"/>
        <path d="M48 42h17m-17 7h10m47-7h17m-17 7h10m-43 42h17m-17 7h10" stroke="#dbeaf3" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="139" cy="102" r="15" fill={`url(#${prefix}-metal)`} stroke="var(--module-accent)" strokeWidth="2.5"/>
        <circle cx="139" cy="102" r="5" fill="#223d5a"/><path d="M139 82v6m0 28v6m-20-20h6m28 0h6m-34-14 4 4m20 20 4 4m0-28-4 4m-20 20-4 4" stroke="#3c526b" strokeWidth="2.5" strokeLinecap="round"/>
      </>
      )
      break
    case 7:
      artwork = (
        <>
        <path d="M31 49h116a14 14 0 0 1 14 14v23H17V63a14 14 0 0 1 14-14z" fill="#223d5a" stroke="#6d8198" strokeWidth="2"/>
        <path d="M42 43h93l12 9H30z" fill={`url(#${prefix}-metal)`} stroke="#77889b" strokeWidth="1.2" strokeLinejoin="round"/>
        <circle cx="91" cy="72" r="25" fill="#102132" stroke="#d7e8f3" strokeWidth="4"/>
        <circle cx="91" cy="72" r="18" fill="#223d5a" stroke="var(--module-accent)" strokeWidth="2.5"/>
        <circle cx="91" cy="72" r="12" fill={`url(#${prefix}-screen)`} stroke="#a5c4e6" strokeWidth="1.5"/>
        <circle cx="91" cy="72" r="5" fill="#dceaf4"/>
        <path d="M35 58h13m-13 8h8m74-10 10-8m-10 39 10 8" stroke="#d8eaf5" strokeWidth="2" strokeLinecap="round"/>
        <path d="M48 34V22h22m49 0h12v12m0 44v12h-22M48 78v12h22" fill="none" stroke="var(--module-accent)" strokeWidth="2" strokeLinecap="round"/>
        <circle cx="36" cy="72" r="3" fill="#dbf4f4"/><circle cx="146" cy="72" r="3" fill="#dbf4f4"/>
        <path d="M73 72h5m26 0h5" stroke="#dbf4f4" strokeWidth="1.5" strokeLinecap="round" opacity=".8"/>
      </>
      )
      break
    case 8:
      artwork = (
        <>
        <path d="M31 25h75a11 11 0 0 1 11 11v35a11 11 0 0 1-11 11H65L48 94v-12h-17a11 11 0 0 1-11-11V36a11 11 0 0 1 11-11z" fill={`url(#${prefix}-screen)`} stroke="#5e738c" strokeWidth="2" strokeLinejoin="round"/>
        <path d="M78 54h67a10 10 0 0 1 10 10v27a10 10 0 0 1-10 10h-8v11l-15-11H78a10 10 0 0 1-10-10V64a10 10 0 0 1 10-10z" fill={`url(#${prefix}-metal)`} stroke="var(--module-accent)" strokeWidth="2" strokeLinejoin="round"/>
        <circle cx="45" cy="54" r="3.5" fill="var(--module-accent)"/><circle cx="59" cy="54" r="3.5" fill="#d6e3ed"/><circle cx="73" cy="54" r="3.5" fill="#d6e3ed"/>
        <path d="M85 70h42m-42 9h30" stroke="#3b536f" strokeWidth="2.5" strokeLinecap="round"/>
        <path d="M46 35h44m-44 8h28" stroke="#eaf7ff" strokeWidth="1.8" strokeLinecap="round" opacity=".8"/>
        <circle cx="139" cy="34" r="9" fill="#f8fafc" stroke="var(--module-accent)" strokeWidth="2"/>
        <path d="m139 27 2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="var(--module-accent)"/>
      </>
      )
      break
    case 9:
      artwork = (
        <>
        <path d="M41 20h98v82H41z" fill="#172b41" stroke="#718296" strokeWidth="2"/>
        <path d="M48 27h84v68H48z" fill="#eaf3f8" stroke="#919fb0" strokeWidth="1"/>
        <path d="M54 33h45" stroke="#92a2b4" strokeWidth="1" strokeDasharray="2 3"/>
        <circle cx="111" cy="43" r="8" fill={`url(#${prefix}-accent-fill)`} stroke="#fffdfa" strokeWidth="1"/>
        <path d="M56 84V70h12v14zm18 0V60h12v24zm18 0V66h12v18zm18 0V49h12v35z" fill={`url(#${prefix}-accent-fill)`}/>
        <path d="M52 87h78" stroke="#3f5a78" strokeWidth="2" strokeLinecap="round"/>
        <path d="m32 106 115 0 12 10H20z" fill={`url(#${prefix}-metal)`} stroke="#768698" strokeWidth="1" strokeLinejoin="round"/>
        <path d="m150 22 3 7 7 3-7 3-3 7-3-7-7-3 7-3zM28 42l2 5 5 2-5 2-2 5-2-5-5-2 5-2zM142 62l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" fill="var(--module-accent)"/>
        <circle cx="52" cy="36" r="2" fill="#223d5a"/><circle cx="60" cy="36" r="2" fill="#223d5a"/>
      </>
      )
      break
    default:
      artwork = (
        <>
        <defs>
          <linearGradient id={`${prefix}-rocket-shell`} x1=".15" y1="0" x2=".9" y2="1">
            <stop offset="0" stopColor="#fffdfa"/><stop offset=".48" stopColor="#dce8f1"/><stop offset="1" stopColor="#97a6b8"/>
          </linearGradient>
          <linearGradient id={`${prefix}-rocket-blue`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#aed3fd"/><stop offset=".5" stopColor="#5382b7"/><stop offset="1" stopColor="#244262"/>
          </linearGradient>
          <linearGradient id={`${prefix}-rocket-flame`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#cef3f2"/><stop offset=".55" stopColor="#7fb5f1"/><stop offset="1" stopColor="#4b7fb9" stopOpacity="0"/>
          </linearGradient>
          <radialGradient id={`${prefix}-rocket-window`} cx=".32" cy=".2" r=".9">
            <stop offset="0" stopColor="#c1efee"/><stop offset=".45" stopColor="#5d86b5"/><stop offset="1" stopColor="#203a56"/>
          </radialGradient>
        </defs>
        <path d="M82 78c0 11 2.4 18 8 26 5.6-8 8-15 8-26z" fill={`url(#${prefix}-rocket-flame)`}/>
        <path d="M69 55c-10 5-17 16-19 31 10-2 19-7 27-16z" fill="#2e4b6b" stroke="#213852" strokeWidth="2" strokeLinejoin="round"/>
        <path d="M111 55c10 5 17 16 19 31-10-2-19-7-27-16z" fill="#2e4b6b" stroke="#213852" strokeWidth="2" strokeLinejoin="round"/>
        <path d="M90 14C78 26 68 43 68 61v21c6 5 14 9 22 12 8-3 16-7 22-12V61c0-18-10-35-22-47z" fill={`url(#${prefix}-rocket-shell)`} stroke="#2d445e" strokeWidth="2.4" strokeLinejoin="round"/>
        <path d="M90 14C82 24 76 36 72 47l18 8 18-8c-4-11-10-23-18-33z" fill={`url(#${prefix}-rocket-blue)`} stroke="#eaf7ff" strokeWidth="1.4" strokeLinejoin="round"/>
        <path d="M72 47 90 55v39c-8-3-16-7-22-12V61c0-5 1.4-10 4-14z" fill="#f7fbff" opacity=".62"/>
        <path d="M90 55 108 47c2.6 4 4 9 4 14v21c-6 5-14 9-22 12z" fill="#7f91a6" opacity=".35"/>
        <path d="M73 73c5 4 11 7 17 9 6-2 12-5 17-9v9c-5 4-11 7-17 9-6-2-12-5-17-9z" fill="#2d445e"/>
        <path d="M75 70h30" stroke="#86b6ed" strokeWidth="1.5" opacity=".9"/>
        <circle cx="90" cy="58" r="10" fill="#eaf7ff" stroke="#314b68" strokeWidth="2"/>
        <circle cx="90" cy="58" r="7" fill={`url(#${prefix}-rocket-window)`}/>
        <path d="M86 55c1.2-1.6 3.1-2.5 5.2-2.4" fill="none" stroke="#e6f8ff" strokeWidth="1.5" strokeLinecap="round" opacity=".85"/>
        <path d="M78 83h24" stroke="#d7e5ef" strokeWidth="1.4" strokeLinecap="round"/>
        <path d="M90 17v24" stroke="#dbf4f4" strokeWidth="1.2" opacity=".72"/>
        <circle cx="90" cy="99" r="2" fill="#8cbdf4"/>
        <path d="m49 39 2 4 4 2-4 2-2 4-2-4-4-2 4-2zm83 2 1.5 3 3 1.5-3 1.5-1.5 3-1.5-3-3-1.5 3-1.5z" fill="#85b3e6"/>
        <path d="M35 106h102l11 9H24z" fill="#223d5a"/>
        <path d="M47 111h86" stroke="#8197af" strokeWidth="1.2" strokeLinecap="round" opacity=".8"/>
        <path d="M58 118h64" stroke="#6f9ed3" strokeWidth="2" strokeLinecap="round"/>
      </>
      )
  }

  return (
    <svg className="roadmap-module-art" viewBox="0 0 180 140" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id={`${prefix}-aura`}>
        <stop offset="0" stopColor="var(--module-accent)" stopOpacity=".32"/>
        <stop offset=".68" stopColor="var(--module-accent)" stopOpacity=".12"/>
        <stop offset="1" stopColor="var(--module-accent)" stopOpacity="0"/>
      </radialGradient>
      <linearGradient id={`${prefix}-metal`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#fffdfa"/><stop offset=".48" stopColor="#e4edf2"/><stop offset="1" stopColor="#8493a4"/>
      </linearGradient>
      <linearGradient id={`${prefix}-screen`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#4c6f96"/><stop offset=".52" stopColor="#1f3650"/><stop offset="1" stopColor="#0c1a2a"/>
      </linearGradient>
      <linearGradient id={`${prefix}-accent-fill`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#e9f8ff"/><stop offset=".42" stopColor="var(--module-accent)"/><stop offset="1" stopColor="var(--module-accent)" stopOpacity=".72"/>
      </linearGradient>
      <filter id={`${prefix}-shadow`} x="-20%" y="-20%" width="140%" height="160%">
        <feDropShadow dx="0" dy="6" stdDeviation="4" floodColor="#122437" floodOpacity=".32"/>
      </filter>
    </defs>
    <ellipse cx="90" cy="119" rx="56" ry="9" fill="#172b41" opacity=".14"/>
    <ellipse cx="90" cy="91" rx="59" ry="34" fill={`url(#${prefix}-aura)`}/>
    <g filter={`url(#${prefix}-shadow)`}>{artwork}</g>
  </svg>
  )
}

function ModuleJourneyItem({ course, index, isNext = false, onOpen }) {
  const itemRef = useRef(null)
  const [isVisible, setIsVisible] = useState(course.id === 1)
  const title = course.title.replace(/^Module \d+: /, '')
  const stateClass = `journey-${course.state.toLowerCase()}`
  const stateLabel = course.state === 'Current' ? 'In progress' : isNext ? 'Up next' : course.state

  useEffect(() => {
    const node = itemRef.current
    if (!node) return
    if (window.matchMedia?.('(max-width: 640px), (pointer: coarse)').matches) return
    if (!('IntersectionObserver' in window)) {
      setIsVisible(true)
      return
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsVisible(true)
        observer.unobserve(node)
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -24px 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <li
    ref={itemRef}
    data-module-id={course.id}
    className={cx('roadmap-module-item', index % 2 === 1 && 'journey-copy-right', stateClass, isNext && 'journey-next', isVisible && 'journey-in-view')}
    style={{
      '--module-reveal-delay': course.id === 1 ? '0ms' : `${Math.min(index, 9) * 65}ms`,
      '--module-accent': moduleJourneyAccents[index % moduleJourneyAccents.length],
    }}
  >
    <button
      type="button"
      className="roadmap-module-platform"
      aria-label={`View Module ${String(course.id).padStart(2, '0')}: ${title}${course.state === 'Locked' ? ' (Locked for progression)' : ''}`}
      onClick={onOpen}
    >
      <span className="roadmap-module-platform-base" aria-hidden="true"/>
      <span className="roadmap-module-platform-tier" aria-hidden="true"/>
      <span className="roadmap-module-platform-top" aria-hidden="true"/>
      <ModuleArtifact moduleId={course.id}/>
      {course.state === 'Current' && (
        <span className="roadmap-here-beacon" aria-hidden="true"><MapPin size={12} strokeWidth={2.6}/> You are here</span>
      )}
      {course.state !== 'Current' && (
        <span className="roadmap-module-platform-status" aria-hidden="true">
          {course.state === 'Completed'
            ? <Check size={12} strokeWidth={3}/>
            : course.state === 'Locked'
              ? <LockKeyhole size={11}/>
              : <BookOpen size={12}/>}
        </span>
      )}
    </button>
    <svg className="roadmap-module-connector" viewBox="0 0 260 100" preserveAspectRatio="none" aria-hidden="true">
      <path d="M 4 74 H 42 Q 56 74 56 60 V 42 Q 56 28 70 28 H 256"/>
      {course.state !== 'Current' && (
        <circle className="roadmap-module-connector-mark" cx="130" cy="28" r="3" />
      )}
    </svg>
    <div className="roadmap-module-info">
      <button type="button" className="roadmap-module-card roadmap-module-card-compact" onClick={onOpen} aria-label={`View Module ${String(course.id).padStart(2, '0')}: ${title}${course.state === 'Locked' ? ' (Locked for progression)' : ''}`}>
        <span className="roadmap-module-ai-icon" aria-hidden="true">
          {(() => { const Icon = MODULE_AI_ICONS[course.id] || Brain; return <Icon size={18} strokeWidth={2.2}/> })()}
        </span>
        <span className="roadmap-module-title">Module {String(course.id).padStart(2, '0')}: {title}</span>
      </button>
    </div>
  </li>
  )
}

function buildModuleTrackPath(count, leftX = 260, rightX = 740, rowHeight = 340) {
  if (!count) return ''
  const x = (index) => (index % 2 === 0 ? leftX : rightX)
  const nodes = Array.from({ length: count }, (_, index) => ({ x: x(index), y: index * rowHeight + rowHeight / 2,
  }))
  const segments = nodes.slice(0, -1).map((start, index) => {
    const end = nodes[index + 1]
    const length = Math.hypot(end.x - start.x, end.y - start.y)
    return { x: (end.x - start.x) / length, y: (end.y - start.y) / length }
  })
  const cornerRadius = 56
  let path = `M ${nodes[0].x} ${nodes[0].y}`
  segments.forEach((segment, index) => {
    const end = nodes[index + 1]
    const isLast = index === segments.length - 1
    const trim = isLast ? 0 : cornerRadius
    path += ` L ${end.x - segment.x * trim} ${end.y - segment.y * trim}`
    if (!isLast) {
      const next = segments[index + 1]
      path += ` Q ${end.x} ${end.y} ${end.x + next.x * cornerRadius} ${end.y + next.y * cornerRadius}`
    }
  })
  return path
}


function Courses({ data, setPage }) {
  const [openModule, setOpenModule] = useState(null)
  const [openSession, setOpenSession] = useState(null)
  const [runnerMoving, setRunnerMoving] = useState(false)
  const [runnerDirection, setRunnerDirection] = useState(1)
  const roadmapMapRef = useRef(null)
  const roadmapRunnerRef = useRef(null)
  const classTests = data.classTests || {}
  const moduleAssessments = data.moduleAssessments || {}
  const grandfatheredThroughModule = getClassTestGrandfatheredThrough(data)
  const currentProgressCourse = getProgressCourse(data.courses)
  const currentCourse = getCurrentCourse(
    data.courses,
    classTests,
    grandfatheredThroughModule,
    data.moduleAssessments || {},
  )
  const mods = data.courses.map((course) => {
    const testsComplete =
      course.id <= grandfatheredThroughModule ||
      getMissingClassTestsForModule(course, classTests).length === 0
    const assessment = moduleAssessments[course.id]
    const assessmentPassed = didPassClassTest(assessment?.score ?? 0, assessment?.total ?? 0)
    return {
      ...course,
      state:
        course.progress === 100 &&
        testsComplete &&
        (course.id <= grandfatheredThroughModule || assessmentPassed)
          ? 'Completed'
          : course.id === currentProgressCourse?.id
            ? 'Current'
            : currentProgressCourse && course.id > currentProgressCourse.id
              ? 'Locked'
              : 'Available',
    }
  })
  const done = mods.filter((c) => c.state === 'Completed').length
  const lessonModulesDone = mods.filter(
    (course) => Number(course.completed || 0) >= Number(course.lessons || 0),
  ).length
  const roadMods = ROADMAP_TOP_FIRST ? mods : mods.slice().reverse()
  const sessionsDone = mods.reduce((sum, course) => sum + (course.completed || 0), 0)
  const sessionsTotal = mods.reduce((sum, c) => sum + (c.lessons || 0), 0)
  const overallPct = sessionsTotal ? Math.round((sessionsDone / sessionsTotal) * 100) : 0
  const nextModuleId = currentProgressCourse ? mods.find((c) => c.id > currentProgressCourse.id && c.state !== 'Completed')?.id : undefined
  const currentRoadIndex = roadMods.findIndex((c) => c.id === currentProgressCourse?.id)
  const roadSpan = Math.max(1, roadMods.length - 1)
  const roadDoneDash = (() => {
    if (currentRoadIndex < 0) return done === mods.length ? '1000 0' : '0 1000'
    const at = Math.round((currentRoadIndex / roadSpan) * 1000)
    return ROADMAP_TOP_FIRST ? `${at} 1000` : `0 ${at} ${1000 - at} 1000`
  })()
  const scrollToModule = (id) => {
    const node = roadmapMapRef.current?.querySelector(`[data-module-id="${id}"]`)
    node?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  const scrollToRoadmap = () => {
    scrollToCurrentRoadmapModule({ root: roadmapMapRef.current, behavior: 'smooth' })
  }
  const selected = mods.find((c) => c.id === openModule)
  const selectedRoadmap = selected ? MODULE_ROADMAP[selected.id] : null
  const selectedMissingTests = selected && selected.id > grandfatheredThroughModule
    ? getMissingClassTestsForModule(selected, classTests)
    : []
  const selectedAssessment = selected ? moduleAssessments[selected.id] : null
  const selectedAssessmentPassed = didPassClassTest(
    selectedAssessment?.score ?? 0,
    selectedAssessment?.total ?? 0,
  )
  const selectedNextSession = selected?.sessions.find((session) => session.num === selected.completed + 1)
  const selectedUnlockSteps = selected?.state === 'Current'
    ? [
        {
          title: 'Complete every learning session',
          complete: selected.completed >= selected.lessons,
          detail: selectedNextSession
            ? `${selected.completed} of ${selected.lessons} complete. Next: Session ${selectedNextSession.num}, ${selectedNextSession.topic.replace(/^Session \d+: /, '')}.`
            : `All ${selected.lessons} sessions are complete.`,
        },
        {
          title: 'Pass class tests for completed sessions',
          complete: selected.id <= grandfatheredThroughModule || selectedMissingTests.length === 0,
          detail: selected.id <= grandfatheredThroughModule
            ? 'Earlier progress already satisfies this requirement.'
            : selectedMissingTests.length
              ? `${selectedMissingTests.length} test${selectedMissingTests.length === 1 ? '' : 's'} remaining. Next: Session ${selectedMissingTests[0].num}.`
              : 'All required class tests are passed.',
        },
        {
          title: 'Pass the module assessment with 75% or higher',
          complete: selected.id <= grandfatheredThroughModule || selectedAssessmentPassed,
          detail: selected.id <= grandfatheredThroughModule
            ? 'An assessment is not required for this credited module.'
            : selectedAssessmentPassed
              ? `Passed with ${percent(selectedAssessment?.score || 0, selectedAssessment?.total || 0)}%.`
              : selected.completed < selected.lessons
                ? 'Available after all learning sessions are complete.'
                : selectedMissingTests.length
                  ? 'Available after the required class tests are passed.'
                  : 'The 75% pass mark is required to unlock the next module.',
        },
      ]
    : []
  const currentMissingTests = currentCourse && currentCourse.id > grandfatheredThroughModule
    ? getMissingClassTestsForModule(currentCourse, classTests)
    : []
  useEffect(() => {
    if (openModule !== null) {
      window.scrollTo(0, 0)
      return
    }
    // Open the Course tab at the bottom cover, where the road starts.
    let inner = 0
    const outer = window.requestAnimationFrame(() => {
      inner = window.requestAnimationFrame(() => {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })
      })
    })
    return () => {
      window.cancelAnimationFrame(outer)
      window.cancelAnimationFrame(inner)
    }
  }, [openModule, currentProgressCourse?.id])

  useEffect(() => {
    const map = roadmapMapRef.current
    const runner = roadmapRunnerRef.current
    if (!map || !runner || openModule !== null || !currentProgressCourse) return

    let metrics = null
    let pathSamples = null
    let frame = 0
    let stopTimer = 0
    let lastScrollAt = Number.NEGATIVE_INFINITY
    let previousY = window.scrollY
    let direction = 1
    // Keep the student's feet close to the active platform while staying on the road.
    const STAND_OFFSET = 48
    const finalModuleId = mods.reduce((max, c) => Math.max(max, c.id), 0)

    const measure = () => {
      const isMobile = window.matchMedia?.('(max-width: 640px)').matches
      const track = map.querySelector(isMobile
        ? '.roadmap-module-track-mobile'
        : '.roadmap-module-track-desktop')
      const path = track?.querySelector('.roadmap-module-motion-path')
      const constructionGlow = track?.querySelector('.roadmap-road-construction-glow')
      const constructionPath = track?.querySelector('.roadmap-road-construction')
      const constructionHead = track?.querySelector('.roadmap-road-build-head')
      const currentTarget = map.querySelector(`[data-module-id="${currentProgressCourse.id}"] .roadmap-module-platform`)
      const finalTarget = map.querySelector(`[data-module-id="${finalModuleId}"] .roadmap-module-platform`)
      if (!track || !path || !currentTarget || !finalTarget || typeof path.getTotalLength !== 'function' || typeof path.getPointAtLength !== 'function') {
        metrics = null
        return
      }

      const trackRect = track.getBoundingClientRect()
      if (!trackRect.width || !trackRect.height) {
        metrics = null
        return
      }

      const mapRect = map.getBoundingClientRect()
      const pathLength = path.getTotalLength()
      const viewBoxHeight = mods.length * 340
      const sampleStep = Math.max(pathLength / 480, 1)
      const closestDistanceTo = (target) => {
        const rect = target.getBoundingClientRect()
        const targetX = rect.left + rect.width / 2 - trackRect.left
        const targetY = rect.top + rect.height / 2 - trackRect.top
        let best = 0
        let bestSq = Infinity
        const sampleStep = Math.max(pathLength / 192, 1)
        const sampleCount = Math.ceil(pathLength / sampleStep)
        const distanceTo = (distance) => {
          const point = path.getPointAtLength(distance)
          const dx = (point.x / 1000) * trackRect.width - targetX
          const dy = (point.y / viewBoxHeight) * trackRect.height - targetY
          return dx * dx + dy * dy
        }
        const consider = (distance) => {
          const sq = distanceTo(distance)
          if (sq < bestSq) {
            bestSq = sq
            best = distance
          }
        }
        for (let sample = 0; sample <= sampleCount; sample += 1) {
          consider(Math.min(sample * sampleStep, pathLength))
        }
        if (sampleStep > 1) {
          const refineStep = sampleStep / 16
          const refineStart = Math.max(0, best - sampleStep)
          const refineEnd = Math.min(pathLength, best + sampleStep)
          for (let distance = refineStart; distance <= refineEnd; distance += refineStep) {
            consider(distance)
          }
        }
        return best
      }
      // Scroll so each module platform sits just below the middle of the screen.
      const scrollFor = (target) => {
        const rect = target.getBoundingClientRect()
        return Math.max(0, rect.top + window.scrollY + rect.height / 2 - window.innerHeight * 0.55)
      }

      metrics = {
        track,
        path,
        constructionGlow,
        constructionPath,
        constructionHead,
        pathLength,
        viewBoxHeight,
        trackWidth: trackRect.width,
        trackHeight: trackRect.height,
        runnerOffsetX: trackRect.left - mapRect.left,
        runnerOffsetY: trackRect.top - mapRect.top,
        // Road is drawn top (Module 10) to bottom (Module 01): larger distance = lower on screen.
        startDistance: 0,
        endDistance: 0,
        scrollAtCurrent: scrollFor(currentTarget),
        scrollAtFinal: scrollFor(finalTarget),
      }
      if (
        !pathSamples ||
        pathSamples.track !== track ||
        pathSamples.width !== trackRect.width ||
        pathSamples.height !== trackRect.height
      ) {
        pathSamples = {
          track,
          width: trackRect.width,
          height: trackRect.height,
          start: closestDistanceTo(currentTarget),
          end: closestDistanceTo(finalTarget),
        }
      }
      metrics.startDistance = Math.min(pathLength, pathSamples.start + STAND_OFFSET)
      metrics.endDistance = Math.min(pathLength, pathSamples.end + STAND_OFFSET)
    }

    // 0 = standing at the current module, 1 = arrived at the final module.
    // Scrolling UP the page walks the student up the road towards Module 10.
    const getProgress = () => {
      if (!metrics) return 0
      const span = metrics.scrollAtCurrent - metrics.scrollAtFinal
      if (span < 1) return 0
      return Math.max(0, Math.min(1, (metrics.scrollAtCurrent - window.scrollY) / span))
    }

    const update = () => {
      if (!metrics) measure()
      if (!metrics) {
        runner.style.opacity = '0'
        setRunnerMoving(false)
        return
      }

      const {
        track,
        path,
        pathLength,
        viewBoxHeight,
        trackWidth,
        trackHeight,
        runnerOffsetX,
        runnerOffsetY,
        startDistance,
        endDistance,
      } = metrics
      const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      const progress = getProgress()
      const distance = startDistance + progress * (endDistance - startDistance)
      const construction = getRoadConstruction(progress, startDistance, endDistance, pathLength)
      const constructionDash = `${construction.length} 1000`
      for (const constructionPath of [metrics.constructionGlow, metrics.constructionPath]) {
        if (!constructionPath) continue
        constructionPath.setAttribute('stroke-dasharray', constructionDash)
        constructionPath.setAttribute('stroke-dashoffset', String(construction.offset))
      }
      if (metrics.constructionHead) {
        const head = path.getPointAtLength(construction.headDistance)
        metrics.constructionHead.setAttribute('cx', String(head.x))
        metrics.constructionHead.setAttribute('cy', String(head.y))
        metrics.constructionHead.style.opacity = progress > 0.015 ? '1' : '0'
      }
      const ahead = path.getPointAtLength(Math.min(pathLength, distance + 2))
      const behind = path.getPointAtLength(Math.max(0, distance - 2))
      const scalePoint = (value) => ({
        x: (value.x / 1000) * trackWidth,
        y: (value.y / viewBoxHeight) * trackHeight,
      })
      const forward = scalePoint(behind)
      const backward = scalePoint(ahead)
      const directionX = backward.x - forward.x
      const directionY = backward.y - forward.y
      const directionLength = Math.hypot(directionX, directionY) || 1
      const normalX = -directionY / directionLength
      const normalY = directionX / directionLength
      const laneWidth = 66 * Math.hypot((trackWidth / 1000) * normalX, (trackHeight / viewBoxHeight) * normalY)
      const runnerWidth = Math.max(155, Math.min(225, laneWidth * 3.7))
      if (Math.abs(runnerWidth - Number.parseFloat(runner.style.width || '0')) >= 2) {
        runner.style.width = `${runnerWidth}px`
      }
      const point = path.getPointAtLength(distance)
      const position = scalePoint(point)
      const runnerY = Math.max(position.y, runnerWidth * 1.5 + 8)
      runner.style.setProperty('--roadmap-runner-x', `${runnerOffsetX + position.x}px`)
      runner.style.setProperty('--roadmap-runner-y', `${runnerOffsetY + runnerY}px`)
      runner.style.setProperty('--student-lean', `${Math.max(-7, Math.min(7, directionX / directionLength * direction * 7))}deg`)
      runner.style.opacity = '1'
      // Progress grows while scrolling up, so the "forward" direction for the motion check is the opposite of scroll direction.
      const shouldRun = !prefersReducedMotion && shouldRunnerMove(progress, lastScrollAt, performance.now(), -direction)
      setRunnerMoving((isMoving) => (isMoving === shouldRun ? isMoving : shouldRun))
    }

    const scheduleUpdate = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        update()
      })
    }
    const handleResize = () => {
      metrics = null
      scheduleUpdate()
    }
    const handleScroll = () => {
      direction = getScrollDirection(previousY, window.scrollY, direction)
      previousY = window.scrollY
      setRunnerDirection(direction)
      lastScrollAt = performance.now()
      if (stopTimer) window.clearTimeout(stopTimer)
      stopTimer = window.setTimeout(() => {
        stopTimer = 0
        scheduleUpdate()
      }, RUNNER_SCROLL_IDLE_MS)
      scheduleUpdate()
    }
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(handleResize)

    resizeObserver?.observe(map)
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleResize)
    update()

    // The cover stays put: the student reveals the roadmap by scrolling, or with the cover's scroll cue.

    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      if (stopTimer) window.clearTimeout(stopTimer)
      resizeObserver?.disconnect()
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleResize)
    }
  }, [currentProgressCourse?.id, mods.length, openModule])

  if (selected) return (
      <div className="page-stack roadmap-page module-session-page">
    <SectionHeading
      eyebrow={`MODULE ${String(selected.id).padStart(2, '0')} · SESSION ROADMAP`}
      title={selected.title.replace(/^Module \d+: /, '')}
      subtitle={selectedRoadmap?.overview}
      action={<button className="secondary-button module-back-button" onClick={() => setOpenModule(null)}><ChevronLeft size={16}/> All modules
            </button>}
    />
    <section className="module-session-summary panel">
      <div className="module-session-summary-heading">
        <div>
          <span className="eyebrow">YOUR PROGRESS</span>
          <h3>Module {selected.id} sessions</h3>
        </div>
        <StatusPill>{selected.state}</StatusPill>
      </div>
      <div className="module-session-progress">
        <span>{selected.completed} of {selected.lessons} sessions complete
            </span>
        <strong>{selected.progress}%</strong>
        <ProgressBar value={selected.progress} color={selected.color}/>
      </div>
    </section>
    {selectedUnlockSteps.length > 0 && (
      <section className="module-unlock-checklist panel" aria-labelledby="module-unlock-heading">
        <div>
          <span className="eyebrow">YOUR NEXT MILESTONE</span>
          <h3 id="module-unlock-heading">What unlocks the next module?</h3>
        </div>
        <ol>
          {selectedUnlockSteps.map((step) => (
            <li className={step.complete ? 'is-complete' : ''} key={step.title}>
              {step.complete ? <CheckCircle2 size={18} aria-hidden="true"/> : <Clock3 size={18} aria-hidden="true"/>}
              <span><strong>{step.title}</strong><small>{step.detail}</small></span>
            </li>
          ))}
        </ol>
      </section>
    )}
    {selected.state === 'Current' && selected.progress === 100 && selectedMissingTests.length > 0 && (
      <div className="notice-card">
        <LockKeyhole size={19}/>
        <div>
          <strong>Complete this module’s class tests to advance</strong>
          <p>Take the class tests for all completed sessions in Module {selected.id} before the next module unlocks.</p>
        </div>
      </div>
    )}
    {selected.state === 'Current' &&
      selected.progress === 100 &&
      selected.id > grandfatheredThroughModule &&
      selectedMissingTests.length === 0 &&
      !selectedAssessmentPassed && (
      <div className="notice-card">
        <ClipboardList size={19}/>
        <div>
          <strong>Module assessment required to advance</strong>
          <p>Complete this module’s MCQ assessment and score at least 75% to unlock the next module.</p>
        </div>
        <button className="secondary-button" onClick={() => setPage('classtests')}>Open Assessment</button>
      </div>
    )}
    {selected.state === 'Current' && selectedNextSession && selectedMissingTests.length > 0 && (
      <div className="notice-card">
        <LockKeyhole size={19}/>
        <div>
          <strong>Lessons remain available while class tests are pending</strong>
          <p>Take completed-session tests in order to advance to the next module. The next test is Session {selectedMissingTests[0].num}.</p>
        </div>
        <button className="secondary-button" onClick={() => setPage('classtests')}>
              Go to class tests
            </button>
      </div>
    )}
    <div className="roadmap-details module-session-details">
      <div className="roadmap-lessons-heading">
        <h4>Session-by-session journey</h4>
        <span>{selected.sessions.filter((session) => session.done).length} of {selected.sessions.length} completed
            </span>
      </div>
      <div className="roadmap-detail-section">
        <h4>Core subjects</h4>
        <div className="roadmap-tags">{selected.subjects.map((subject) => (
                <span className="roadmap-tag" key={subject.num}><strong>{subject.num}</strong>{subject.name}</span>))}</div>
      </div>
      <div className="roadmap-detail-section">
        <h4>Skills you’ll build</h4>
        <div className="roadmap-skills">{(selectedRoadmap?.skills || []).map((skill) => (
                <span key={skill}><Sparkles size={13}/>{skill}</span>))}</div>
      </div>
      <div className="roadmap-detail-section">
        <h4>Career pathways</h4>
        <div className="roadmap-skills roadmap-roles">{(selectedRoadmap?.roles || []).map((role) => (
                <span key={role}><UserRound size={13}/>{role}</span>))}</div>
      </div>
      {selected.materials.length > 0 && (
            <div className="roadmap-resources"><FileText size={15}/><strong>Module resources:</strong>{selected.materials.map((material) => (
                <span key={material.name}>{material.name}</span>))}</div>
          )}
    </div>
    <SessionQuestMap
      moduleId={selected.id}
      sessions={selected.sessions}
      completed={selected.completed}
      moduleState={selected.state}
      onOpenSession={setOpenSession}
    />
    {openSession && (
          <Modal title={`Session ${String(openSession.num).padStart(2, '0')}`} onClose={() => setOpenSession(null)} className="roadmap-session-detail-modal">
      <div className="roadmap-session-detail">
        <div className="roadmap-session-detail-hero">
          <div className={cx('roadmap-session-detail-icon', `detail-status-${openSession.status.toLowerCase().replaceAll(' ', '-')}`)}>
            {openSession.status === 'Completed' ? <CheckCircle2 size={25}/> : openSession.status === 'Locked' ? <LockKeyhole size={23}/> : <Sparkles size={24}/>}
          </div>
          <div className="roadmap-session-detail-meta">
            <span>LEARNING CHECKPOINT</span>
            <StatusPill>{openSession.status}</StatusPill>
          </div>
        </div>
        <h4>{openSession.topic.replace(/^Session \d+: /, '')}</h4>
        <div className="roadmap-session-module">
          <span className="roadmap-session-module-icon"><BookOpen size={16}/></span>
          <span><small>MODULE {String(selected.id).padStart(2, '0')}</small><strong>{selected.title.replace(/^Module \d+: /, '')}</strong></span>
        </div>
      </div>
      <div className="modal-actions"><button className="primary-button" onClick={() => setOpenSession(null)}><Check size={15}/> Got it
              </button></div>
    </Modal>
        )}
  </div>
    )

  return (
    <div className="page-stack roadmap-page">
    {currentCourse?.progress === 100 && currentMissingTests.length > 0 && (
      <div className="notice-card">
        <LockKeyhole size={19}/>
        <div>
          <strong>Class tests required before advancing</strong>
          <p>Pass the pending class tests for Module {currentCourse.id} before taking the next class test.</p>
        </div>
      </div>
    )}
    <div
      ref={roadmapMapRef}
      className="roadmap-game-map roadmap-journey-map roadmap-module-map"
      role="group"
      aria-label="Course module map"
    >
      <RoadmapAiIcons/>
      <svg className="roadmap-module-track roadmap-module-track-desktop" viewBox={`0 0 1000 ${mods.length * 340}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="roadmap-track-surface" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#223d5a"/><stop offset=".52" stopColor="#172b41"/><stop offset="1" stopColor="#0e1e2f"/>
          </linearGradient>
          <filter id="roadmap-track-shadow" x="-20%" y="-10%" width="140%" height="130%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="9"/>
            <feOffset dy="16"/>
            <feComponentTransfer><feFuncA type="linear" slope=".28"/></feComponentTransfer>
            <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="roadmap-track-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5"/>
          </filter>
        </defs>
        <path d={buildModuleTrackPath(mods.length)} fill="none" stroke="#0c1a29" strokeWidth="96" strokeLinecap="round" strokeLinejoin="round" transform="translate(0 15)" filter="url(#roadmap-track-shadow)"/>
        <path d={buildModuleTrackPath(mods.length)} fill="none" stroke="#223d5a" strokeWidth="84" strokeLinecap="round" strokeLinejoin="round" transform="translate(0 7)"/>
        <path d={buildModuleTrackPath(mods.length)} fill="none" stroke="#142436" strokeWidth="78" strokeLinecap="round" strokeLinejoin="round"/>
        <path className="roadmap-module-motion-path" d={buildModuleTrackPath(mods.length)} fill="none" stroke="url(#roadmap-track-surface)" strokeWidth="66" strokeLinecap="round" strokeLinejoin="round"/>
        <path d={buildModuleTrackPath(mods.length)} fill="none" stroke="#61a7f3" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" opacity=".28" filter="url(#roadmap-track-glow)"/>
        <path d={buildModuleTrackPath(mods.length)} fill="none" stroke="#61a7f3" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
        <path d={buildModuleTrackPath(mods.length)} fill="none" stroke="#d3e0ea" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity=".8"/>
        <path className="roadmap-road-construction-glow" d={buildModuleTrackPath(mods.length)} pathLength="1000" strokeDasharray="0 1000"/>
        <path className="roadmap-road-construction" d={buildModuleTrackPath(mods.length)} pathLength="1000" strokeDasharray="0 1000"/>
        <circle className="roadmap-road-build-head" cx="0" cy="0" r="11" opacity="0"/>
        <path className="roadmap-road-done-glow" d={buildModuleTrackPath(mods.length)} pathLength="1000" strokeDasharray={roadDoneDash}/>
        <path className="roadmap-road-done" d={buildModuleTrackPath(mods.length)} pathLength="1000" strokeDasharray={roadDoneDash}/>
        <path className="roadmap-road-flow" d={buildModuleTrackPath(mods.length)} fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" pathLength="1000"/>
      </svg>
      <svg className="roadmap-module-track roadmap-module-track-mobile" viewBox={`0 0 1000 ${mods.length * 340}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <filter id="roadmap-mobile-track-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4"/>
          </filter>
        </defs>
        <path d={buildModuleTrackPath(mods.length, 200, 800)} fill="none" stroke="#0c1a29" strokeWidth="96" strokeLinecap="round" strokeLinejoin="round" transform="translate(0 15)"/>
        <path d={buildModuleTrackPath(mods.length, 200, 800)} fill="none" stroke="#223d5a" strokeWidth="84" strokeLinecap="round" strokeLinejoin="round" transform="translate(0 7)"/>
        <path className="roadmap-module-motion-path" d={buildModuleTrackPath(mods.length, 200, 800)} fill="none" stroke="#172b41" strokeWidth="66" strokeLinecap="round" strokeLinejoin="round"/>
        <path d={buildModuleTrackPath(mods.length, 200, 800)} fill="none" stroke="#61a7f3" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" opacity=".3" filter="url(#roadmap-mobile-track-glow)"/>
        <path d={buildModuleTrackPath(mods.length, 200, 800)} fill="none" stroke="#61a7f3" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
        <path className="roadmap-road-construction-glow" d={buildModuleTrackPath(mods.length, 200, 800)} pathLength="1000" strokeDasharray="0 1000"/>
        <path className="roadmap-road-construction" d={buildModuleTrackPath(mods.length, 200, 800)} pathLength="1000" strokeDasharray="0 1000"/>
        <circle className="roadmap-road-build-head" cx="0" cy="0" r="11" opacity="0"/>
        <path className="roadmap-road-done-glow" d={buildModuleTrackPath(mods.length, 200, 800)} pathLength="1000" strokeDasharray={roadDoneDash}/>
        <path className="roadmap-road-done" d={buildModuleTrackPath(mods.length, 200, 800)} pathLength="1000" strokeDasharray={roadDoneDash}/>
        <path className="roadmap-road-flow" d={buildModuleTrackPath(mods.length, 200, 800)} fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" pathLength="1000"/>
      </svg>
      <div className="roadmap-sparkles" aria-hidden="true">{Array.from({ length: 18 }, (_, i) => <span key={i} style={{ '--spark-x': `${(i * 53) % 100}%`, '--spark-y': `${(i * 37) % 100}%`, '--spark-delay': `${(i % 6) * -1.3}s` }}/>)}</div>
      <ol className="roadmap-module-list" aria-label="Course modules">
        {roadMods.map((course, index) => (
              <ModuleJourneyItem
          key={course.id}
          course={course}
          index={index}
          isNext={course.id === nextModuleId}
          onOpen={() => setOpenModule(course.id)}
        />))}
      </ol>
      <div ref={roadmapRunnerRef} className="roadmap-runner" aria-hidden="true">
        <Suspense fallback={null}>
          <RoadmapStudent running={runnerMoving} direction={runnerDirection} />
              </Suspense>
              </div>
    </div>
    <section className="roadmap-hero" aria-labelledby="roadmap-hero-title">
      <div className="roadmap-hero-glow" aria-hidden="true"><i/><i/><i/></div>
      <div className="roadmap-hero-copy">
        <span className="roadmap-hero-pill"><Sparkles size={13}/> Master's programme · Industry-embedded</span>
        <h1 id="roadmap-hero-title">Your learning <span>roadmap</span></h1>
        <p className="roadmap-hero-program">{USER.program || 'Your programme'}</p>
        <p className="roadmap-hero-sub">12 months · {mods.length} modules · Foundation to advanced</p>
        <div className="roadmap-hero-actions">
          {currentProgressCourse && (
            <button type="button" className="roadmap-hero-cta" onClick={() => setOpenModule(currentProgressCourse.id)}>
              Continue Module {String(currentProgressCourse.id).padStart(2, '0')} <ArrowRight size={16}/>
            </button>
          )}
          <button type="button" className="roadmap-hero-ghost" onClick={() => setPage('materials')}><BookMarked size={16}/> Study materials</button>
        </div>
      </div>
      <div className="roadmap-hero-stats">
        <div className="roadmap-ring" role="img" aria-label={`${overallPct}% of sessions complete`}>
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <defs>
              <linearGradient id="roadmap-ring-gradient" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="var(--rm-orange)"/><stop offset="1" stopColor="var(--rm-pink)"/>
              </linearGradient>
            </defs>
            <circle className="roadmap-ring-track" cx="60" cy="60" r="50"/>
            <circle className="roadmap-ring-fill" cx="60" cy="60" r="50" pathLength="100" strokeDasharray={`${overallPct} 100`}/>
          </svg>
          <div><strong>{overallPct}%</strong><span>complete</span></div>
        </div>
        <ul className="roadmap-hero-metrics">
          <li><strong>{lessonModulesDone}<small>/{mods.length}</small></strong><span>Modules’ lessons complete</span></li>
          <li><strong>{sessionsDone}<small>/{sessionsTotal}</small></strong><span>Sessions done</span></li>
          <li><strong>{mods.length - lessonModulesDone}</strong><span>Modules with lessons left</span></li>
        </ul>
      </div>
      <ol className="roadmap-milestones" aria-label="Jump to a module" style={{ '--rm-count': mods.length }}>
        {mods.map((course) => (
          <li key={course.id} className={cx('roadmap-milestone', `is-${course.state.toLowerCase()}`)}>
            <button type="button" onClick={() => scrollToModule(course.id)} aria-label={`Show Module ${course.id} on the map (${course.state})`}>
              <i>{course.state === 'Completed' ? <Check size={12} strokeWidth={3}/> : String(course.id).padStart(2, '0')}</i>
            </button>
          </li>
        ))}
      </ol>
      <button type="button" className="roadmap-hero-scroll" onClick={scrollToRoadmap}>
        <span>Back to your roadmap</span>
        <ChevronUp size={16}/>
      </button>
    </section>
  </div>
  )
}

function Materials({ data }) {
  const startedCourses = data.courses.filter((course) => course.sessions.some((session) => session.done))
  const currentProgressCourse = getProgressCourse(data.courses)
  const [materialQuery, setMaterialQuery] = useState('')
  const [moduleFilter, setModuleFilter] = useState('all')
  const [recentModuleIds, setRecentModuleIds] = useState([])
  const [open, setOpen] = useState(() => (
    startedCourses.find((c) => c.id === currentProgressCourse?.id) ||
    startedCourses.find((c) => c.progress < 100) ||
    startedCourses[startedCourses.length - 1]
  )?.id ?? null)
  const q = materialQuery.trim().toLowerCase()
  const totalCompletedLessons = startedCourses.reduce((n, c) => n + c.sessions.filter((s) => s.done).length, 0)

  useEffect(() => {
    const stored = localStorage.getItem('campusly-recent-material-modules')
    if (!stored) return
    try {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) setRecentModuleIds(parsed.filter((id) =>
        data.courses.some((course) => course.id === id && course.sessions.some((session) => session.done)),
      ).slice(0, 3))
    } catch (error) {
      console.warn('Could not read recently viewed material modules.', error)
    }
  }, [data.courses])

  const openModule = (moduleId) => {
    setOpen(moduleId)
    setModuleFilter('all')
    const updated = [moduleId, ...recentModuleIds.filter((id) => id !== moduleId)].slice(0, 3)
    setRecentModuleIds(updated)
    try {
      localStorage.setItem('campusly-recent-material-modules', JSON.stringify(updated))
    } catch (error) {
      console.warn('Could not save recently viewed material modules.', error)
    }
  }

  const visibleCourses = startedCourses.filter((course) => moduleFilter === 'all' || String(course.id) === moduleFilter)
  const filteredCourses = visibleCourses.filter((course) => {
    const titleMatchesQuery = !q || course.title.toLowerCase().includes(q)
    const materials = course.materials.filter((material) =>
      (titleMatchesQuery || !q || material.name.toLowerCase().includes(q)),
    )
    const lessons = course.sessions.some((session) =>
      session.done && (titleMatchesQuery || !q || session.topic.toLowerCase().includes(q)),
    )
    return titleMatchesQuery || lessons || materials.length > 0
  })
  return (
    <div className="page-stack timetable-page materials-page">
    <section className="timetable-hero materials-hero">
      <div className="timetable-hero-copy">
        <span className="timetable-brand-pill"><BookMarked size={17}/> LEARNING LIBRARY</span>
        <h1>Study <span>Materials</span></h1>
        <p>Lesson notes and module resources, all in one place.</p>
        <div className="timetable-week-pill"><span className="timetable-target-mark"><BookOpen size={15}/></span><strong>YOUR COURSE, YOUR RESOURCES</strong></div>
      </div>
      <div className="materials-hero-art" aria-hidden="true">
        <div className="materials-art-rays"><i/><i/><i/><i/></div>
        <div className="materials-art-page materials-art-page-back"><i/><i/><i/><i/></div>
        <div className="materials-art-page materials-art-page-front">
          <BookMarked size={46}/>
          <span><i/><i/><i/></span>
        </div>
        <div className="materials-art-book"><BookOpen size={34}/></div>
        <div className="materials-art-check"><Check size={17}/></div>
        <Sparkles className="materials-art-sparkle" size={23}/>
      </div>
    </section>
    <div className="resource-summary"><div><div className="resource-summary-icon"><BookMarked size={20}/></div><div><strong>{totalCompletedLessons} completed lessons</strong><span>Across {startedCourses.length} started modules</span></div></div><span className="library-label"><ShieldCheck size={15}/> Student library
        </span></div>
    <div className="materials-filters" role="group" aria-label="Filter study materials">
      <label className="materials-search"><span><Search size={14}/> Search library</span>
        <input type="search" value={materialQuery} onChange={(event) => setMaterialQuery(event.target.value)} placeholder="Search lessons or files" aria-label="Search study materials"/>
      </label>
      <label><span><Filter size={14}/> Module</span>
        <select className="select-control" value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)} aria-label="Filter by module">
          <option value="all">All started modules</option>
          {startedCourses.map((course) => <option key={course.id} value={String(course.id)}>{course.title}</option>)}
        </select>
      </label>
    </div>
    {recentModuleIds.length > 0 && !q && (
      <div className="materials-recent" aria-label="Recently viewed modules">
        <span>Recently viewed</span>
        {recentModuleIds.map((id) => {
          const course = startedCourses.find((item) => item.id === id)
          return course ? <button type="button" key={id} onClick={() => openModule(id)}>{course.title.replace(/^Module \d+: /, '')}<ArrowRight size={13}/></button> : null
        })}
      </div>
    )}
    <p className="materials-results-count" role="status" aria-live="polite">
      {filteredCourses.length} {filteredCourses.length === 1 ? 'module' : 'modules'} shown
    </p>
    <div className="mat-modules">{filteredCourses.map((c) => {
      const courseMatchesQuery = !q || c.title.toLowerCase().includes(q)
      const lessons = c.sessions.filter((s) => s.done && (courseMatchesQuery || !q || s.topic.toLowerCase().includes(q)))
      const materials = c.materials.filter((material) =>
        (courseMatchesQuery || !q || material.name.toLowerCase().includes(q)),
      )
      const ready = c.sessions.filter((s) => s.done).length
      const isOpen = open === c.id || Boolean(q)
      return (
            <section key={c.id} className={cx('panel mat-module', isOpen && 'open')} id={`mat-module-${c.id}`}>
        <button className="mat-head" onClick={() => open === c.id ? setOpen(null) : openModule(c.id)} aria-expanded={isOpen}>
          <div className={cx('file-icon', `banner-${c.color}`)}><BookOpen size={18}/></div>
          <div className="mat-title">
            <strong>{c.title}</strong>
            <span className="muted-text">{c.sessions.length} lessons · {ready} completed · {materials.length} resources</span>
            {c.id === currentProgressCourse?.id && <span className="mat-current-module-tag">YOUR CURRENT MODULE</span>}
          </div>
          <ChevronDown size={18} className="mat-chev"/>
        </button>
        {isOpen && (
                <div className="mat-body">
          {ready > 0 || materials.length > 0 ? (
                    <>
            {materials.length > 0 && (
                        <div className="mat-extra"><span className="eyebrow">MODULE RESOURCES</span>{materials.map((m) => (
                            <span key={m.name} className="course-tag"><FileText size={13}/> {m.name} <small>{m.type}</small></span>))}</div>
                      )}
            <ol className="mat-lessons">{lessons.map((s) => {
              const name = s.topic.replace(/^Session \d+: /, '')
              return (
                            <li key={s.num}>
                <span className="session-num">{s.num}</span>
                <div className="mat-lesson"><strong>Lesson {s.num}: {name}</strong><span className="muted-text">Completed lesson</span></div>
                <span className="mat-note-unavailable" title="A lesson notes file has not been uploaded for this lesson.">Notes not uploaded</span>
              </li>
                          )
                        })}</ol>
          </>
                  ) : (
                    <div className="mat-locked-empty"><LockKeyhole size={15}/>
                      Complete a lesson to unlock its study materials.
                    </div>
                  )}
        </div>
              )}
      </section>
          )
        })}</div>
    {startedCourses.length === 0 && !q && <EmptyState title="No modules started yet" text="Start a module from your roadmap to unlock its study materials."/>}
    {(q || moduleFilter !== 'all') && !filteredCourses.length && <EmptyState title="No matching study materials" text="Try a different search or choose another module."/>}
  </div>
  )
}

function Timetable({ data, batchStore }) {
  const batch = studentBatches(batchStore, USER.email)[0]
  const batchSessions = batch
    ? batchStore.sessions.filter((session) => session.batchId === batch.id)
    : []
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()))
  const [viewMode, setViewMode] = useState('week')
  const weekDates = getWeekDates(weekStart)
  const modules = buildBatchModuleSchedule(data.courses, batch?.startDate)
  const batchDays = new Set((batch?.days || '').split(',').map((day) => day.trim()).filter(Boolean),
  )
  const weekLabel = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' })
  const weekYear = new Intl.DateTimeFormat('en-IN', { year: 'numeric' })
  const firstDay = weekDates[0]
  const lastDay = weekDates[weekDates.length - 1]
  const rangeLabel = firstDay.getFullYear() === lastDay.getFullYear()
    ? `${weekLabel.format(firstDay)} – ${weekLabel.format(lastDay)}, ${weekYear.format(lastDay)}`
    : `${new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(firstDay)} – ${new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(lastDay)}`

  return (
    <div className="page-stack timetable-page">
    <section className="timetable-hero">
      <div className="timetable-hero-copy">
        <span className="timetable-brand-pill"><GraduationCap size={17}/> LMS Portal
          </span>
        <h1>
            Class <span>Timetable</span></h1>
        <p>Plan your week and stay on top of every session.</p>
        <div className="timetable-week-pill"><span className="timetable-target-mark"><i/></span><strong>YOUR WEEK AT A GLANCE</strong></div>
      </div>
      <div className="timetable-hero-art" aria-hidden="true">
        <div className="timetable-art-rays"><i/><i/><i/><i/></div>
        <div className="timetable-art-calendar">
          <div className="timetable-art-rings"><i/><i/><i/><i/></div>
          <div className="timetable-art-cells"><i/><i/><i/><i/><i/><i/><i/><i/><i/></div>
          <span><Check size={18}/></span>
        </div>
        <div className="timetable-art-cap"><GraduationCap size={62}/></div>
        <div className="timetable-art-clock"><Clock3 size={43}/></div>
        <div className="timetable-art-books"><BookOpen size={34}/></div>
      </div>
    </section>
    {batch ? (
        <>
      <section className="calendar-batch-summary">
        <div className="calendar-batch-icon"><BookOpen size={43}/><span><Layers size={17}/></span></div>
        <div className="calendar-batch-name"><span>ASSIGNED BATCH · {batch.id}</span><strong>{batch.name}</strong><small>{batch.course}</small></div>
        <div className="calendar-batch-time"><Clock3 size={16}/><span>{batch.days} · {fmtTime(batch.time)} – {endTime(batch.time, batch.duration)}</span></div>
        <div className="calendar-batch-location"><Building2 size={15}/><span>{batch.mode} · {batch.room || 'Location to be confirmed'}</span></div>
      </section>
      <div className="week-calendar-toolbar">
        <div className="week-calendar-heading"><span><CalendarDays size={18}/> WEEKLY SCHEDULE
              </span><strong><CalendarDays size={16}/>{rangeLabel}</strong></div>
        <div className="week-calendar-actions">
          <button className="secondary-button" onClick={() => setWeekStart(getWeekStart(new Date()))}><CalendarDays size={16}/>
                Today
              </button>
          <button className="week-step-button" aria-label="Previous week" onClick={() => setWeekStart((date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() - 7))}><ChevronLeft size={17}/></button>
          <button className="week-step-button" aria-label="Next week" onClick={() => setWeekStart((date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7))}><ChevronRight size={17}/></button>
          <div className="calendar-view-switch" role="group" aria-label="Schedule view">
            <button type="button" className={viewMode === 'week' ? 'active' : ''} aria-label="Week view" aria-pressed={viewMode === 'week'} onClick={() => setViewMode('week')}><LayoutGrid size={15}/></button>
            <button type="button" className={viewMode === 'list' ? 'active' : ''} aria-label="List view" aria-pressed={viewMode === 'list'} onClick={() => setViewMode('list')}><List size={15}/></button>
          </div>
        </div>
      </div>
      <div className={`timetable-grid calendar-week-grid${viewMode === 'list' ? ' list-view' : ''}`}>
        {weekDates.map((date) => {
          const key = toDateKey(date)
          const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date)
          const module = modules.find((item) => key >= item.startDate && key <= item.endDate)
          const isBatchDay = batchDays.has(dayName)
          const inBatchPeriod = key >= batch.startDate && key <= batch.endDate
          const hasClass = isBatchDay && inBatchPeriod && module
          const { onDate: daySessions, movedFrom: movedFromSessions } =
            getCalendarSessionsForDate(batchSessions, key)
          const showPlannedClass = hasClass && !daySessions.length && !movedFromSessions.length
          const isToday = key === toDateKey(new Date())
          return (
                <section className={`day-column calendar-day-column${isToday ? ' today-column' : ''}`} key={key}>
            <div className="day-header"><span>{new Intl.DateTimeFormat('en-IN', { weekday: 'short' }).format(date)}</span><strong>{date.getDate()}</strong></div>
            {isToday && <span className="calendar-today-label">TODAY</span>}
            <div className="day-classes">
              {daySessions.map((session) => {
                const sessionModule = modules.find(
                  (item) => item.title.replace(/^Module \d+: /, '') === session.subject,
                )
                return (
                  <article
                    className={`class-card calendar-class-card class-${sessionModule?.color || module?.color || 'blue'}${session.status === 'Rescheduled' ? ' calendar-rescheduled-class' : ''}`}
                    key={session.id}
                  >
                    <span className="calendar-module-label">{session.status.toUpperCase()} · SESSION {session.number}</span>
                    <strong>{session.subject}</strong>
                    {session.topic && <small className="calendar-session-topic">{session.topic}</small>}
                    <span className="class-time"><Clock3 size={12}/>{fmtTime(session.time)} – {endTime(session.time, session.duration)}</span>
                    <small className="class-room">{batch.room || batch.mode}</small>
                  </article>
                )
              })}
              {movedFromSessions.map((session) => (
                <article className="class-card calendar-class-card calendar-rescheduled-notice" key={`moved-${session.id}`}>
                  <span className="calendar-module-label">POSTPONED · SESSION {session.number}</span>
                  <strong>{session.subject}</strong>
                  <small className="calendar-session-topic">Moved to {fmtDate(session.date)} · {fmtTime(session.time)}</small>
                </article>
              ))}
              {showPlannedClass ? (
                      <article className={`class-card calendar-class-card class-${module.color}`}>
                <span className="calendar-module-label">MODULE {module.id} · PLANNED CLASS</span>
                <strong>{module.title.replace(/^Module \d+: /, '')}</strong>
                <span className="class-time"><Clock3 size={12}/>{fmtTime(batch.time)} – {endTime(batch.time, batch.duration)}</span>
                <small className="class-room">{batch.room || batch.mode}</small>
              </article>
                    ) : (
                      !daySessions.length && !movedFromSessions.length && <p className="calendar-empty-day"><CalendarDays size={24}/><span>{!inBatchPeriod ? 'Outside batch dates' : isBatchDay ? 'No module scheduled' : 'No class'}</span></p>
                    )}
            </div>
          </section>
              )
            })}
      </div>
      <div className="notice-card"><CalendarCheck size={19}/><div><strong>Module schedule</strong><p>Module dates follow the course plan, aligned to your batch start date. Regular classes follow your assigned batch days and times; check notifications for any updates.</p></div></div>
    </>
      ) : (
        <div className="panel empty-state"><div><CalendarDays size={20}/></div><strong>No batch assigned yet</strong><p>Your module timetable and class timings will appear here after the admin team assigns your batch.</p></div>
      )}
  </div>
  )
}

function Attendance({ data }) {
  const currentCourse = getProgressCourse(data.courses)
  const reachedCourses = data.courses.filter(
    (course) => !currentCourse || course.id <= currentCourse.id,
  )
  const [term, setTerm] = useState(currentCourse?.title || reachedCourses[0]?.title || '')
  useEffect(() => {
    if (currentCourse?.title) {
      setTerm(currentCourse.title)
    }
  }, [currentCourse?.title])
  const short = (d) => { const [dd, mm] = d.split(' ')
    return `${dd}-${mm}` }
  const toNum = (d) => { const dt = new Date(d)
    return isNaN(dt) ? d : `${String(dt.getDate()).padStart(2, '0')}-${String(dt.getMonth() + 1).padStart(2, '0')}-${dt.getFullYear()}` }
  const selectedSem = reachedCourses.find((c) => c.title === term) || currentCourse || reachedCourses[0] || null
  const shown = selectedSem ? [selectedSem] : data.courses
  const recordsFor = (c) => data.attendance.filter((a) => c.title.endsWith(a.course))
  const rows = shown.map((c) => {
    const r = recordsFor(c)
    const attended = r.filter((a) => a.status === 'Present')
    const absent = r.filter((a) => a.status === 'Absent')
    const pct = r.length ? (attended.length / r.length) * 100 : null
    return { code: c.code, title: c.title, subject: c.title.replace(/^Module \d+: /, ''), faculty: c.instructor, conducted: r.length, attended: attended.length, pct, absent: absent.map((a) => short(a.date)).reverse().join(', '), last: attended[0] ? toNum(attended[0].date) : '—',
    }
  })
  return (
    <div className="page-stack">
    <div className="panel att-report"><h3 className="att-title">Your Attendance Report</h3><label className="field-label att-label">MODULE</label><select className="select-control att-select" value={selectedSem?.title || ''} onChange={(e) => setTerm(e.target.value)}>{reachedCourses.map((c) => (
            <option key={c.id}>{c.title}</option>))}</select><span className="muted-text">{shown.length} of {reachedCourses.length} reached modules shown
        </span></div>
    <div className="panel att-table-panel"><div className="table-scroll" role="region" aria-label="Attendance summary table" tabIndex={0}><table className="att-table"><thead><tr><th>CODE</th><th>MODULE</th><th>FACULTY</th><th>CONDUCTED</th><th>ATTENDED</th><th>EXEMPTED</th><th>EXCUSED</th><th>ALLOWED</th><th>%</th><th>ABSENT DATES</th><th>LAST ATTENDED</th></tr></thead><tbody>{rows.map((r) => (
                <tr key={r.code}><td>{r.code}</td><td>{r.subject}</td><td>{r.faculty}</td><td>{r.conducted}</td><td>{r.attended}</td><td>0</td><td>0</td><td>0</td><td className={r.pct === null ? '' : r.pct < 75 ? 'att-low' : 'att-ok'}>{r.pct === null ? '—' : `${r.pct.toFixed(2)}%`}</td><td>{r.absent || '—'}</td><td>{r.last}</td></tr>))}</tbody></table></div>{rows.length === 0 && <EmptyState title="No attendance yet" text="Attendance appears once classes for this module are held."/>}</div>
  </div>
  )
}

function downloadMarkCard(data) {
  const published = getPublishedModuleMarks(data.marks)
  const totalScore = published.reduce((s, m) => s + m.score, 0)
  const totalPossible = published.reduce((s, m) => s + m.total, 0)
  const overall = Math.round((totalScore / Math.max(1, totalPossible)) * 100)
  const rows = published.map((m) => `<tr><td>Module ${m.module}</td><td>${m.subject} (${m.code})</td><td>${m.examType || 'Module Final'}</td><td>${m.date}</td><td>${m.score}/${m.total}</td><td>${getGrade(percent(m.score, m.total))}</td></tr>`).join('')
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Mark Card - ${USER.name}</title><style>body{font-family:Arial,sans-serif;max-width:700px;margin:40px auto;color:#222222}h1{font-size:22px;margin-bottom:2px}.sub{color:#666666;font-size:13px;margin-bottom:24px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #cccccc;padding:8px 10px;font-size:13px;text-align:left}th{background:#f4f4f4}.overall{margin-top:18px;font-size:15px;font-weight:bold}.foot{margin-top:30px;font-size:11px;color:#888888}</style></head><body><h1>Skill AI — Student Mark Card</h1><div class="sub">${USER.name} · Student ID ${USER.studentId} · Batch ${USER.batch} · ${USER.program || ''}</div><table><thead><tr><th>Module</th><th>Subject</th><th>Exam</th><th>Date</th><th>Score</th><th>Grade</th></tr></thead><tbody>${rows}</tbody></table><p class="overall">Overall score: ${overall}% (${totalScore} out of ${totalPossible} points)</p><p class="foot">Generated from the Student Portal on ${new Date().toLocaleDateString('en-IN')}. Marks are published module-wise by the institute.</p></body></html>`
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `mark-card-${String(USER.studentId || 'student').toLowerCase()}.html`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}

function downloadFeeReceipt(fee, fees) {
  const isPaid = fee.status === 'Paid' && fee.receipt
  if (isPaid) {
    const receipt = buildFeeReceiptData(fee, fees, USER)
    downloadFeeReceiptDocx(receipt).catch((error) => {
      console.error('Fee receipt download failed.', error)
      window.alert(`Could not generate the fee receipt: ${error instanceof Error ? error.message : String(error)}`)
    })
    return
  }
  const title = `Fee Challan ${fee.id}`
  const rows = [
    ['Challan number', fee.id],
    ['Module', `Module ${fee.module} (${fee.code})`],
    ['Course / subject', fee.title],
    ['Amount', fee.amount === null ? 'Not set — awaiting fee confirmation' : rupee(fee.amount)],
    ['Due date', fee.date || 'Not scheduled'],
    ['Status', fee.status],
  ]
  const tableRows = rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title} - ${USER.name}</title><style>body{font-family:Arial,sans-serif;max-width:700px;margin:40px auto;color:#222222}h1{font-size:22px;margin-bottom:2px}.sub{color:#666666;font-size:13px;margin-bottom:24px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #cccccc;padding:8px 10px;font-size:13px;text-align:left}th{background:#f4f4f4;width:35%}.foot{margin-top:30px;font-size:11px;color:#888888}</style></head><body><h1>Skill AI — Fee Challan</h1><div class="sub">${USER.name} · Student ID ${USER.studentId} · Batch ${USER.batch} · ${USER.program || ''}</div><table><tbody>${tableRows}</tbody></table><p class="foot">This challan reflects the current fee status on record. Amount and payment details are set by the institute once the fee is confirmed. Generated from the Student Portal on ${new Date().toLocaleDateString('en-IN')}.</p></body></html>`
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `fee-challan-${fee.id.toLowerCase()}.html`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}


function Marks({ data }) {
  const published = getPublishedModuleMarks(data.marks)
  const totalScore = published.reduce((s, m) => s + m.score, 0)
  const totalPossible = published.reduce((s, m) => s + m.total, 0)
  const remaining = data.marks.filter((m) => m.status !== 'Published').length
  const [showCard, setShowCard] = usePortalState('markCard', false)
  const overallPct = Math.round((totalScore / Math.max(1, totalPossible)) * 100)
  const publishedModules = new Set(published.map((m) => m.module)).size
  return (
    <div className="page-stack marks-page">
      <section className="marks-hero">
        <div className="marks-hero-copy">
          <span className="marks-hero-eyebrow">ACADEMIC PERFORMANCE</span>
          <h1>
            Marks &amp; <span>Results</span></h1>
          <p>Your marks are published module-wise, once each module ends.</p>
        </div>
        <div className="marks-hero-art" aria-hidden="true">
          <div className="marks-art-rays"><i/><i/><i/><i/></div>
          <div className="marks-art-paper">
            <span className="marks-art-grade">A+</span>
            <i/><i/><i/>
            <b><Check size={18}/></b>
          </div>
          <div className="marks-art-cap"><GraduationCap size={83}/></div>
          <div className="marks-art-books"><BookOpen size={42}/></div>
          <div className="marks-art-spark"><Sparkles size={20}/></div>
        </div>
      </section>
      <div className="stats-grid three-stats">
        <StatCard
          icon={ChartNoAxesColumn}
          label="Modules published"
          value={publishedModules}
          detail="Module marks released"
          tone="violet"
        />
        <StatCard
          icon={TrendingUp}
          label="Overall score"
          value={`${overallPct}%`}
          detail={`${totalScore} out of ${totalPossible} points`}
          tone="green"
        />
        <StatCard
          icon={Clock3}
          label="Marks remaining"
          value={remaining}
          detail="Theory and practical marks pending"
          tone="orange"
        />
      </div>
      <Panel
        title="Module marks"
        subtitle="Module 2 includes separate 100-mark Theory and Practical exams"
        className="marks-results-panel"
      >
        <div className="table-scroll marks-results-table" role="region" aria-label="Module marks table" tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th>MODULE</th>
                <th>SUBJECT / EXAM</th>
                <th>MARKS</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {published.length ? (
                published.map((mark) => (
                  <tr key={mark.id}>
                    <td>
                      <div className="leave-request-cell">
                        <strong>Module {mark.module}</strong>
                        <span>{mark.code}</span>
                      </div>
                    </td>
                    <td>
                      <div className="marks-subject-cell">
                        <strong>{mark.subject}</strong>
                        <span>{mark.examType || 'Module Final'} · {mark.date}</span>
                      </div>
                    </td>
                    <td>
                      <div className="marks-score-cell">
                        <strong>{mark.score}<span>/{mark.total}</span></strong>
                        <span className="grade-pill">{getGrade(percent(mark.score, mark.total))}</span>
                      </div>
                    </td>
                    <td>
                      <StatusPill>{mark.status}</StatusPill>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="muted-text" colSpan={4}>
                    No published module marks yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="notice-card">
        <ShieldCheck size={19} />
        <div>
          <strong>How module marks work</strong>
          <p>Each module publishes its exam marks after the module ends. Module 2 has two separate exams: Theory and Practical, with 100 marks each.</p>
        </div>
      </div>
      {showCard && (
        <Modal title="Mark card" onClose={() => setShowCard(false)}>
          <div className="modal-course-tag">{USER.program || 'Your program'}</div>
          <h3 className="modal-assignment-title">{USER.name}</h3>
          <p className="modal-description">
            Student ID {USER.studentId} · Batch {USER.batch}
          </p>
          {published.length ? (
            <div className="table-scroll" role="region" aria-label="Mark card table" tabIndex={0}>
              <table>
                <thead>
                  <tr>
                    <th>MODULE</th>
                    <th>EXAM</th>
                    <th>SUBJECT</th>
                    <th>SCORE</th>
                    <th>GRADE</th>
                  </tr>
                </thead>
                <tbody>
                  {published.map((mark) => (
                    <tr key={mark.id}>
                      <td>
                        <strong className="normal-weight">Module {mark.module}</strong>
                      </td>
                      <td>{mark.examType || 'Module Final'}</td>
                      <td>{mark.subject}</td>
                      <td>
                        <strong>
                          {mark.score}
                          <span className="muted-text">/{mark.total}</span>
                        </strong>
                      </td>
                      <td>
                        <span className="grade-pill">
                          {getGrade(percent(mark.score, mark.total))}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="No published marks yet"
              text="Your mark card will fill in as module marks are published."
            />
          )}
          <p style={{ marginTop: 14, fontWeight: 700 }}>
            Overall score: {overallPct}%{' '}
            <span className="muted-text">
              ({totalScore} out of {totalPossible} points)
            </span>
          </p>
          <div className="modal-actions">
            <button className="secondary-button" onClick={() => setShowCard(false)}>
              Close
            </button>
            <button className="primary-button" onClick={() => downloadMarkCard(data)}>
              <Download size={15} /> Download
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Modal({ title, onClose, children, wide, className = '', portal = false }) {
  useEffect(() => { const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler) }, [onClose])
  const content = (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}><div className={cx('modal-card', wide && 'modal-wide', className)} role="dialog" aria-modal="true" aria-label={title}><div className="modal-header"><h3>{title}</h3><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={18}/></button></div>{children}</div></div>
  )
  return portal ? createPortal(content, document.body) : content
}

function Leave({ data, updateData }) {
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState({ from: '', to: '', reason: '' })
  const [details, setDetails] = usePortalState('leaveDetails', null)
  const leaves = [...data.leaves].sort((a, b) => b.id.localeCompare(a.id))
  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }))
  const resetForm = () => {
    setForm({ from: '', to: '', reason: '' })
  }
  function apply(e) {
    e.preventDefault()
    if (form.to < form.from) { setNotice('The end date must be on or after the start date.')
      return }
    const days = Math.round((new Date(form.to) - new Date(form.from)) / 86400000) + 1
    const fmt = (date) => new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric',
      })
    const item = { id: `LV-${Math.floor(1000 + Math.random() * 9000)}`, type: 'Leave', from: fmt(form.from), to: fmt(form.to), days, reason: form.reason.trim(), status: 'Pending', remarks: 'Your leave request has been submitted and is awaiting staff review.', applied: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric',
      }),
    }
    updateData((current) => ({ ...current, leaves: [...current.leaves, item] }))
    resetForm()
    setNotice(`Leave request ${item.id} submitted successfully.`)
  }
  return (
    <div className="page-stack">
    <SectionHeading className="leave-applications-heading" eyebrow="TIME AWAY" title="Leave Applications" subtitle="Request leave with dates and a short reason."/>
    {notice && (
        <div className={cx('success-banner', notice.startsWith('The end') && 'error-banner')}><CheckCircle2 size={17}/>{notice}<button onClick={() => setNotice('')}><X size={15}/></button></div>
      )}
    <div className="stats-grid three-stats leave-stats-grid"><StatCard icon={FileCheck2} label="Total Requests" value={data.leaves.length} detail="Leave applications" tone="violet"/><StatCard icon={Clock3} label="Pending Review" value={data.leaves.filter((l) => l.status === 'Pending').length} detail="Awaiting a decision" tone="orange"/><StatCard icon={ShieldCheck} label="Approved" value={data.leaves.filter((l) => l.status === 'Approved').length} detail="Approved requests" tone="green" className="leave-approved-stat" watermark={Check}/></div>
    <Panel title="New leave request" subtitle="Enter your leave dates and reason">
      <form className="leave-simple-form" onSubmit={apply}>
        <div className="leave-simple-date-grid">
          <div><label className="field-label" htmlFor="leave-from">
                From date
              </label><input id="leave-from" type="date" value={form.from} max={form.to || undefined} onChange={(e) => setField('from', e.target.value)} required/></div>
          <div><label className="field-label" htmlFor="leave-to">
                To date
              </label><input id="leave-to" type="date" value={form.to} min={form.from || undefined} onChange={(e) => setField('to', e.target.value)} required/></div>
        </div>
        <div><label className="field-label" htmlFor="leave-reason">
              Reason
            </label><textarea id="leave-reason" rows={3} value={form.reason} onChange={(e) => setField('reason', e.target.value)} minLength={5} maxLength={1000} placeholder="Briefly explain why you need leave" required/></div>
        <div className="leave-form-actions"><button className="primary-button" type="submit"><Send size={15}/> Submit request
            </button></div>
      </form>
    </Panel>
    <Panel title="Your leave requests" subtitle="Check the dates, reason, and approval status">
      <div className="table-scroll" role="region" aria-label="Leave requests table" tabIndex={0}><table><thead><tr><th>REQUEST</th><th>LEAVE DATES</th><th>REASON</th><th>STATUS</th><th/></tr></thead><tbody>{leaves.map((l) => (
                <tr key={l.id}><td><div className="leave-request-cell"><strong>Leave request</strong><span>{l.id} · Applied {l.applied}</span></div></td><td>{l.from}{l.to !== l.from && (
                      <><br/><span className="muted-text">to {l.to}</span></>
                    )}</td><td><div className="leave-reason-cell">{l.reason}</div></td><td><StatusPill>{l.status}</StatusPill></td><td><button className="text-button" onClick={() => setDetails(l)}>
                      Details
                    </button></td></tr>))}</tbody></table></div>
      {leaves.length === 0 && <EmptyState title="No leave requests yet" text="Your submitted leave requests will appear here."/>}
    </Panel>
    {details && (
        <Modal title={`Leave request ${details.id}`} onClose={() => setDetails(null)}>
      <div className="leave-detail-top"><div className="detail-badge"><FileCheck2 size={20}/></div><div><strong>Leave request</strong><span>{details.from}{details.to !== details.from ? ` – ${details.to}` : ''} · {details.days} day(s)
              </span></div><StatusPill>{details.status}</StatusPill></div>
      <div className="leave-detail-reason"><span>Reason</span><p>{details.reason || 'No reason provided.'}</p></div>
      <div className="leave-detail-remarks"><span>Review update</span><p>{details.remarks || 'No review update yet.'}</p></div>
      <div className="modal-actions"><button className="secondary-button" onClick={() => setDetails(null)}>
              Close
            </button></div>
    </Modal>
      )}
  </div>
  )
}

function Certificates({ data }) {
  const [selected, setSelected] = usePortalState('certificate', null)
  return (
    <div className="page-stack"><SectionHeading eyebrow="YOUR ACHIEVEMENTS" title="Certificates" subtitle="Celebrate your progress and view your course achievements."/><div className="certificate-banner"><div className="certificate-banner-icon"><Award size={27}/></div><div><span className="eyebrow light">EVERY STEP COUNTS</span><h3>You're building something great.</h3><p>Your completed learning milestones will appear here as certificates.</p></div><div className="certificate-banner-art"><Award size={86}/></div></div><div className="course-grid certificate-grid">{data.certificates.map((c) => (
          <article className="certificate-card" key={c.id}><div className="certificate-art"><div className="certificate-seal"><Award size={28}/></div><span className="certificate-watermark">C</span><span className="certificate-caption">CERTIFICATE OF ACHIEVEMENT</span><strong>{c.title}</strong><span className="certificate-institute">{c.issuer}</span></div><div className="certificate-card-bottom"><div><strong>{c.title}</strong><span>{c.status === 'Issued' ? `Issued ${c.date}` : 'Complete the course to unlock'}</span></div><StatusPill>{c.status}</StatusPill><button className="icon-button" disabled={c.status !== 'Issued'} onClick={() => setSelected(c)} title="View certificate"><ExternalLink size={16}/></button></div></article>))}</div>{selected && (
        <Modal title="Certificate preview" onClose={() => setSelected(null)}><div className="certificate-preview"><Award size={38}/><span>CERTIFICATE OF ACHIEVEMENT</span><h3>{selected.title}</h3><p>This is to recognise the learning milestone achieved by</p><strong>{USER.name}</strong><p>Issued by {selected.issuer}</p><small>{selected.id} · {selected.date}</small></div><div className="modal-actions"><button className="secondary-button" onClick={() => setSelected(null)}>
              Close preview
            </button></div></Modal>
      )}</div>
  )
}

function Notifications({ data, updateData, onOpenNotification }) {
  const [filter, setFilter] = useState('All')
  const notifications = portalNotifications(data)
  const list = notifications.filter((n) => filter === 'All' || (filter === 'Unread' ? !n.read : n.read))
  const unreadCount = notifications.filter((notification) => !notification.read).length
  const filterCounts = { All: notifications.length, Unread: unreadCount, Read: notifications.length - unreadCount }
  const groups = groupNotificationsByDate(list)
  const filters = ['All', 'Unread', 'Read'] as const

  function markAll() {
    updateData((d) => ({
      ...d,
      notifications: d.notifications.map((n) => ({ ...n, read: true })),
      classTestNotificationReads: {
        ...d.classTestNotificationReads,
        ...Object.fromEntries(getClassTestNotifications(d).map((n) => [n.id, true])),
      },
      feeNotificationReads: {
        ...d.feeNotificationReads,
        ...Object.fromEntries(portalFeeNotifications(d).map((n) => [n.id, true])),
      },
      batchNotificationReads: {
        ...d.batchNotificationReads,
        ...Object.fromEntries(getBatchSessionNotifications(loadBatches(), USER.email).map((n) => [n.id, true])),
      },
    }))
  }

  function openNotification(notification) {
    onOpenNotification(notification)
  }

  return (
    <div className="page-stack">
      <SectionHeading
        eyebrow="YOUR UPDATES"
        title="Notifications"
        subtitle="A quick look at what’s new across your learning space."
        action={<button className="secondary-button" onClick={markAll}><Check size={15}/> Mark all as read</button>}
      />
      <div className="filter-row">
        <div className="segmented">
          {filters.map((f) => (
            <button
              key={f}
              className={filter === f ? 'selected' : ''}
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
            >
              <span>{f}</span>
              <span className="notification-filter-count" aria-label={`${filterCounts[f]} notifications`}>
                {filterCounts[f]}
              </span>
            </button>
          ))}
        </div>
        <span className="muted-text">{notifications.length} total</span>
      </div>
      <div className="notification-groups">
        {groups.map((group) => (
          <section className="notification-date-group" key={group.title}>
            <div className="notification-group-heading">
              <h3>{group.title}</h3>
              <span>{group.notifications.length}</span>
            </div>
            <div className="notification-list">
              {group.notifications.map((n) => (
                <article
                  className={cx('notification-card', !n.read && 'notification-unread')}
                  key={n.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openNotification(n)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      openNotification(n)
                    }
                  }}
                >
                  <div className={cx('notification-icon', `notify-${n.kind}`)}>
                    {n.kind === 'batch-session' ? <CalendarDays size={19}/>
                      : n.kind === 'result' ? <ChartNoAxesColumn size={19}/>
                        : n.kind === 'leave' ? <FileCheck2 size={19}/>
                          : n.kind === 'class-test' ? <ClipboardList size={19}/>
                            : n.kind === 'fee' ? <Wallet size={19}/>
                              : <BookOpen size={19}/>}
                  </div>
                  <div className="notification-content">
                    <div className="notification-title">
                      <strong>{n.title}</strong>
                      {!n.read && <span className="unread-label">NEW</span>}
                    </div>
                    <p>{n.message}</p>
                    <span><Clock3 size={13}/>{n.time}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
      {list.length === 0 && <EmptyState icon={Bell} title="All caught up" text="There are no notifications in this view."/>}
    </div>
  )
}

function LegacyProfile({ data, updateData, onReset }) {
  const [profile, setProfile] = useState({ name: USER.name, email: USER.email, phone: USER.phone, program: USER.program, batch: USER.batch,
  })
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    try {
      const savedProfile = JSON.parse(localStorage.getItem(profileKey()) || 'null')
      if (savedProfile) setProfile(savedProfile)
    } catch (error) {
      console.error('Could not load the saved profile.', error)
    }
  }, [])
  function save(e) { e.preventDefault()
    localStorage.setItem(profileKey(), JSON.stringify(profile))
    setSaved(true)
    setTimeout(() => setSaved(false), 2500) }
  function reset() { if (window.confirm('Reset all your saved data and profile edits?')) { onReset()
      setProfile({ name: USER.name, email: USER.email, phone: USER.phone, program: USER.program, batch: USER.batch,
      })
      localStorage.removeItem(profileKey())
      setSaved(false) } }
  return (
    <div className="page-stack"><SectionHeading eyebrow="YOUR ACCOUNT" title="My Profile" subtitle="Keep your student information up to date."/><div className="profile-layout"><div className="profile-main"><section className="panel profile-card"><div className="profile-cover"><div className="profile-avatar-large">{initials(profile.name)}</div></div><div className="profile-summary"><div><h3>{profile.name}</h3><p>{profile.program} · {profile.batch}</p><span className="verified-label"><ShieldCheck size={14}/> Student account
                </span></div><span className="student-id">{USER.studentId}</span></div><div className="profile-divider"/><form className="profile-form" onSubmit={save}><div className="profile-form-heading"><h3>Personal information</h3><p>These details are stored on this device.</p></div><div className="form-two-col"><div><label className="field-label" htmlFor="profile-name">
                    Full name
                  </label><input id="profile-name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} required/></div><div><label className="field-label" htmlFor="profile-email">
                    Email address
                  </label><input id="profile-email" type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} required/></div><div><label className="field-label" htmlFor="profile-phone">
                    Phone number
                  </label><input id="profile-phone" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })}/></div><div><label className="field-label" htmlFor="profile-program">
                    Program
                  </label><input id="profile-program" value={profile.program} onChange={(e) => setProfile({ ...profile, program: e.target.value })}/></div><div><label className="field-label" htmlFor="profile-batch">
                    Batch
                  </label><input id="profile-batch" value={profile.batch} onChange={(e) => setProfile({ ...profile, batch: e.target.value })}/></div><div><label className="field-label" htmlFor="profile-id">
                    Student ID
                  </label><input id="profile-id" value={USER.studentId} disabled/></div></div><div className="profile-actions">{saved && (
                  <span className="saved-note"><CheckCircle2 size={15}/> Changes saved
                  </span>
                )}<button type="submit" className="primary-button">
                  Save changes <Check size={15}/></button></div></form></section></div><div className="profile-aside"><Panel title="Account details"><div className="account-detail"><span><Mail size={15}/> Email
              </span><strong>{USER.email}</strong></div><div className="account-detail"><span><GraduationCap size={15}/> Student ID
              </span><strong>{USER.studentId}</strong></div><div className="account-detail"><span><CalendarDays size={15}/> Joined
              </span><strong>{USER.joined}</strong></div><div className="account-detail"><span><ShieldCheck size={15}/> Account type
              </span><strong>Student</strong></div></Panel><Panel title="Data settings"><p className="settings-description">Reset your local changes and return to the original records.</p><button className="danger-outline-button" onClick={reset}><RotateCcw size={15}/> Reset data
            </button></Panel></div></div></div>
  )
}

function SearchResults({ query, data, setPage }) {
  const q = query.toLowerCase().trim()
  if (!q) return null
  const results = [
    ...data.courses.filter((c) => `${c.title} ${c.instructor}`.toLowerCase().includes(q)).map((c) => ({ type: 'Course', title: c.title, subtitle: c.instructor, page: 'courses' })),
    ...getPublishedModuleMarks(data.marks).filter((m) => `module ${m.module} ${m.subject} ${m.code}`.toLowerCase().includes(q)).map((m) => ({ type: 'Module mark', title: m.subject, subtitle: `Module ${m.module} · ${m.code}`, page: 'marks',
      })),
    ...data.notifications.filter((n) => `${n.title} ${n.message}`.toLowerCase().includes(q)).map((n) => ({ type: 'Notification', title: n.title, subtitle: n.time, page: 'notifications',
      })),
  ]
  return (
    <div className="search-results"><div className="search-results-heading"><Search size={16}/> Results for “{query}” <span>{results.length}</span></div>{results.length ? (
        results.map((r, i) => (
          <button key={`${r.type}-${i}`} onClick={() => setPage(r.page)}><div><strong>{r.title}</strong><span>{r.type} · {r.subtitle}</span></div><ArrowRight size={15}/></button>))
      ) : (
        <p>No matches found. Try a course, result, or notification.</p>
      )}</div>
  )
}

export default function App() {
  return (
    <PortalNavigation><PortalApp/></PortalNavigation>
  )
}

function PortalApp() {
  const { user: cloudUser, ready: authReady, recovery, configured: cloudConfigured } = useCloudAuth()
  const { confirmNavigation } = usePortalNavigationGuard()
  const previewMode = import.meta.env.DEV && !cloudConfigured
  const [loggedIn, setLoggedIn] = useState(false)
  const [onboardingStep, setOnboardingStep] = useState(null)
  const cloudOnboardingIdentity = useRef('')
  const [page, setPage] = usePortalState('page', 'dashboard')
  const [initialDataLoad] = useState(() => {
    let error = ''
    const data = loadDemoData(() => {
      error = 'Saved portal data could not be loaded. Retry before continuing; autosave is paused to protect it.'
    })
    return { data, error }
  })
  const [data, setData] = useState(initialDataLoad.data)
  const [loadError, setLoadError] = useState(initialDataLoad.error)
  const [saveError, setSaveError] = useState('')
  const [saveRetry, setSaveRetry] = useState(0)
  const [reminderRuntimeError, setReminderRuntimeError] = useState('')
  const reminderDeliveryRef = useRef(new Set<string>())
  const [batchStore, setBatchStore] = useState(loadBatches)
  const [selectedClassTest, setSelectedClassTest] = useState(null)
  const [notificationUndo, setNotificationUndo] = useState<PortalNotification | null>(null)
  const [mobileOpen, setMobileOpen] = usePortalState('mobileOpen', false)
  const [search, setSearch] = usePortalState('search', '')
  const showSearch = Boolean(search.trim())
  const resetNavigation = useResetNavigation()
  const refreshStudentData = useCallback(() => {
    let error = ''
    const nextData = loadDemoData(() => {
      error = 'Saved portal data could not be loaded. Retry before continuing; autosave is paused to protect it.'
    })
    setData(nextData)
    setLoadError(error)
    setSaveError('')
  }, [])

  useEffect(() => {
    if (!notificationUndo) return
    const timeout = window.setTimeout(() => setNotificationUndo(null), 7000)
    return () => window.clearTimeout(timeout)
  }, [notificationUndo])

  useEffect(() => {
    if (page === 'assignments') setPage('dashboard')
  }, [page, setPage])

  useEffect(() => {
    if (!authReady) return
    if (cloudUser && !recovery) {
      const identity = cloudUser.id || cloudUser.email || ''
      if (identity && cloudOnboardingIdentity.current !== identity) {
        cloudOnboardingIdentity.current = identity
        if (sessionStorage.getItem(LOGIN_ONBOARDING_KEY) !== 'complete') {
          setOnboardingStep((current) => {
            if (current) return current
            sessionStorage.setItem(LOGIN_ONBOARDING_KEY, 'profile')
            return 'profile'
          })
        }
      }
      localStorage.removeItem('campusly-demo-session')
      setCurrentUser({ email: cloudUser.email || '', name: cloudUser.email?.split('@')[0] || 'Student', phone: '', program: '', batch: '', studentId: '', joined: '',
      })
      refreshStudentData()
      setLoggedIn(true)
    } else {
      if (!cloudUser) cloudOnboardingIdentity.current = ''
      if (localStorage.getItem('campusly-demo-session') !== DEMO_USER.email) setLoggedIn(false)
    }
  }, [cloudUser, authReady, recovery, refreshStudentData])

  useEffect(() => {
    if (loadError) return
    try {
      saveDemoData(data)
      setSaveError('')
    } catch (reason) {
      const detail = reason instanceof Error ? ` ${reason.message}` : ''
      setSaveError(`Your portal changes could not be saved to this browser.${detail}`)
    }
  }, [data, loadError, saveRetry])
  useEffect(() => {
    const preferences = normalizeReminderPreferences(data.reminderPreferences)
    if (
      !preferences.browserAlerts ||
      typeof Notification === 'undefined' ||
      Notification.permission !== 'granted'
    ) {
      return
    }

    const storageKey = `portal-reminder-deliveries:${USER.email.toLowerCase()}`
    const delivered = reminderDeliveryRef.current
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '[]')
      if (Array.isArray(saved)) saved.forEach((id) => typeof id === 'string' && delivered.add(id))
    } catch (error) {
      console.error('Could not read delivered browser reminder history.', error)
      setReminderRuntimeError('Reminder history could not be read; alerts may repeat after a reload.')
    }

    const timers: number[] = []
    const maxTimeout = 2_147_483_647
    const schedule = (event: ReturnType<typeof getPortalReminderEvents>[number]) => {
      const deliveryId = `${USER.email.toLowerCase()}:${event.id}:${event.startAt.getTime()}`
      if (delivered.has(deliveryId)) return

      const delay = event.notifyAt.getTime() - Date.now()
      if (delay > maxTimeout) {
        timers.push(window.setTimeout(() => schedule(event), maxTimeout))
        return
      }

      timers.push(window.setTimeout(() => {
        if (Notification.permission !== 'granted' || delivered.has(deliveryId)) return
        let notification: Notification
        try {
          notification = new Notification(event.title, {
            body: event.body,
            tag: deliveryId,
          })
        } catch (error) {
          console.error('Could not show a browser reminder.', error)
          setReminderRuntimeError('A browser reminder could not be shown. Check this site’s notification settings.')
          return
        }

        delivered.add(deliveryId)
        notification.onclick = () => window.focus()
        try {
          localStorage.setItem(storageKey, JSON.stringify([...delivered].slice(-100)))
          setReminderRuntimeError('')
        } catch (error) {
          console.error('Could not save browser reminder history.', error)
          setReminderRuntimeError('The reminder was shown, but its delivery could not be saved.')
        }
      }, Math.max(0, delay)))
    }

    getPortalReminderEvents(data, batchStore, USER.email).forEach(schedule)
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [batchStore, data])
  useEffect(() => {
    const refreshBatchStore = () => setBatchStore(loadBatches())
    const activeStudentDataKey = () => USER.email === DEMO_USER.email
      ? 'campusly-demo-data'
      : `portal-data-${USER.email}`
    const handleStudentDataRefresh = (event) => {
      if (event.detail?.email && event.detail.email.toLowerCase() !== USER.email.toLowerCase()) return
      refreshStudentData()
    }
    const handleStorage = (event) => {
      if (event.key === BATCH_STORAGE_KEY) refreshBatchStore()
      if (event.key === activeStudentDataKey()) refreshStudentData()
    }
    window.addEventListener(BATCH_STORE_CHANGE_EVENT, refreshBatchStore)
    window.addEventListener('campusly-demo-data-change', handleStudentDataRefresh)
    window.addEventListener('storage', handleStorage)
    return () => {
      window.removeEventListener(BATCH_STORE_CHANGE_EVENT, refreshBatchStore)
      window.removeEventListener('campusly-demo-data-change', handleStudentDataRefresh)
      window.removeEventListener('storage', handleStorage)
    }
  }, [refreshStudentData])
  useEffect(() => { const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault()
        document.querySelector('.global-search input')?.focus() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey) }, [])
  useEffect(() => {
    const TAP_TARGETS = 'button, .course-card, .course-row, .class-card, .notice-card, .deadline-item, .fee-challan, .notification-content'
    const timeouts = new WeakMap()
    const spawn = (event) => {
      const target = event.target?.closest?.(TAP_TARGETS)
      if (!target || (target.matches('button') && target.disabled)) return
      const button = target.matches('button')
      const animationClass = button ? 'tapping' : 'touch-tapping'
      target.classList.remove(animationClass)
      void target.offsetWidth
      target.classList.add(animationClass)
      window.clearTimeout(timeouts.get(target))
      timeouts.set(target, window.setTimeout(() => target.classList.remove(animationClass), 500),
      )
      const rect = target.getBoundingClientRect()
      const size = Math.max(rect.width, rect.height) * 0.9
      const x = event.clientX || event.clientY ? event.clientX - rect.left : rect.width / 2
      const y = event.clientX || event.clientY ? event.clientY - rect.top : rect.height / 2
      const ripple = document.createElement('span')
      ripple.className = 'click-ripple'
      ripple.style.width = ripple.style.height = `${size}px`
      ripple.style.left = `${x - size / 2}px`
      ripple.style.top = `${y - size / 2}px`
      target.appendChild(ripple)
      ripple.addEventListener('animationend', () => ripple.remove())
      window.setTimeout(() => ripple.remove(), 700)
    }
    document.addEventListener('pointerdown', spawn)
    return () => {
      document.removeEventListener('pointerdown', spawn)
    }
  }, [])
  const updateData = (updater) => setData((prev) => (typeof updater === 'function' ? updater(prev) : updater))
  function openClassTestTarget(target) {
    setSelectedClassTest(target)
    setPage('classtests')
  }
  function openNotificationTarget(notification) {
    if (notification.kind === 'class-test') {
      openClassTestTarget(notification)
      return
    }
    if (notification.kind === 'fee') {
      setPage('fees')
      return
    }
    if (notification.kind === 'batch-session') {
      setPage('timetable')
      return
    }
    if (notification.kind === 'result') {
      setPage('marks')
      return
    }
    if (notification.kind === 'leave') {
      setPage('leave')
      return
    }
    setPage('notifications')
  }
  function openNotification(notification) {
    const wasUnread = !notification.read
    updateData((d) => setNotificationReadState(d, notification, true))
    setNotificationUndo(wasUnread ? notification : null)
    openNotificationTarget(notification)
  }
  function undoNotificationRead() {
    if (!notificationUndo) return
    updateData((d) => setNotificationReadState(d, notificationUndo, false))
    setNotificationUndo(null)
  }
  async function logout() { if (!confirmNavigation()) return
    if (cloudConfigured) { const { error } = await supabase.auth.signOut()
      if (error) { window.alert('Could not sign out. Please try again.')
        return } } localStorage.removeItem('campusly-demo-session')
    sessionStorage.removeItem(LOGIN_ONBOARDING_KEY)
    setLoggedIn(false)
    setNotificationUndo(null)
    setOnboardingStep(null)
    resetNavigation() }
  function reset() { setData(resetDemoData())
    setLoadError('')
    localStorage.removeItem(profileKey()) }
  function advanceOnboarding(step) {
    sessionStorage.setItem(LOGIN_ONBOARDING_KEY, step || 'complete')
    setOnboardingStep(step)
  }
  function login(acc) {
    setCurrentUser(acc)
    if (acc.email === DEMO_USER.email) {
      localStorage.setItem('campusly-demo-session', acc.email)
      sessionStorage.setItem(LOGIN_ONBOARDING_KEY, 'complete')
      setOnboardingStep(null)
    } else {
      localStorage.removeItem('campusly-demo-session')
      advanceOnboarding('profile')
    }
    refreshStudentData()
    setNotificationUndo(null)
    resetNavigation()
    setLoggedIn(true)
  }
  if (!authReady) return (
      <div className="login-main min-h-screen" role="status" aria-live="polite" aria-busy="true">
        Loading…
      </div>
    )
  if (!loggedIn || recovery) return <Login onLogin={login} previewMode={previewMode}/>
  if (onboardingStep) return <StudentOnboarding step={onboardingStep} onPasswordChanged={() => advanceOnboarding('profile')} onProfileCompleted={() => advanceOnboarding(null)}/>

  const Profile = StudentProfile
  const pageInfo = titles[page] || titles.dashboard
  const usesPastelTheme = page !== 'dashboard' && page !== 'courses'
  return (
    <>
    <div className={cx('app-shell', usesPastelTheme && 'pastel-theme', mobileOpen && 'drawer-open')}>
      <Sidebar page={page} setPage={setPage} data={data} onLogout={logout} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen}/>
      <main className={cx('main-area', usesPastelTheme && 'pastel-theme')} data-tab={page}>
        <Topbar onLogout={logout} page={page} setPage={setPage} data={data} search={search} setSearch={(value) => setSearch(value)}/>
        {loadError && <div className="portal-save-error" role="alert"><span>{loadError}</span><button type="button" className="secondary-button" onClick={refreshStudentData}>Retry loading</button></div>}
        {saveError && <div className="portal-save-error" role="alert"><span>{saveError} Your changes are still visible but may not be available after you close the portal.</span><button type="button" className="secondary-button" onClick={() => setSaveRetry((retry) => retry + 1)}>Retry save</button></div>}
        {reminderRuntimeError && <div className="portal-save-error" role="alert"><span>{reminderRuntimeError}</span><button type="button" className="icon-button" aria-label="Dismiss reminder error" onClick={() => setReminderRuntimeError('')}><X size={15}/></button></div>}
        <div className="content-area">
          {showSearch && search.trim() ? (
              <>
            <div className="search-page-heading">
              <div className="eyebrow">PORTAL SEARCH</div>
              <h2>Search results</h2>
              <p>Find courses, results, and notifications.</p>
            </div>
            <SearchResults query={search} data={{ ...data, notifications: portalNotifications(data) }} setPage={(id) => { setPage(id)
                    setSearch('') }}/>
            <button className="link-button search-clear" onClick={() => setSearch('')}><X size={15}/> Clear search
                </button>
          </>
            ) : (
              <>
            {(!usesPastelTheme || page === 'batch' || page === 'attendance') && (
                  page === 'attendance' ? (
                    <div className="mobile-page-heading timetable-hero attendance-mobile-hero">
                      <div className="timetable-hero-copy attendance-hero-copy">
                        <span className="timetable-brand-pill"><CalendarCheck size={17}/> CLASS TRACKER</span>
                        <h1>Class <span>Attendance</span></h1>
                        <p>{pageInfo[1]}</p>
                        <div className="timetable-week-pill"><span className="timetable-target-mark"><i/></span><strong>YOUR ATTENDANCE AT A GLANCE</strong></div>
                      </div>
                      <div className="timetable-hero-art attendance-hero-art" aria-hidden="true">
                        <div className="timetable-art-rays"><i/><i/><i/><i/></div>
                        <div className="timetable-art-calendar">
                          <div className="timetable-art-rings"><i/><i/><i/><i/></div>
                          <div className="timetable-art-cells"><i/><i/><i/><i/><i/><i/><i/><i/><i/></div>
                          <span><Check size={18}/></span>
                        </div>
                        <div className="timetable-art-cap"><ChartNoAxesColumn size={54}/></div>
                        <div className="timetable-art-clock"><CheckCircle2 size={37}/></div>
                        <div className="timetable-art-books"><CalendarCheck size={30}/></div>
                      </div>
                    </div>
                  ) : (
                    <div className="mobile-page-heading"><h1>{pageInfo[0]}</h1><p>{pageInfo[1]}</p></div>
                  )
                )}
            {page === 'dashboard' && <Dashboard
              data={data}
              batchStore={batchStore}
              setPage={setPage}
              onOpenClassTest={openClassTestTarget}
              onNotificationClick={openNotification}
            />}
            {page === 'courses' && <Courses data={data} setPage={setPage}/>}
            {page === 'materials' && <Materials data={data}/>}
            {page === 'timetable' && <Timetable data={data} batchStore={batchStore}/>}
            {page === 'attendance' && <Attendance data={data}/>}
            {page === 'marks' && <Marks data={data}/>}
            {page === 'classtests' && <ClassTests data={data} batchStore={batchStore} updateData={updateData} selectedTest={selectedClassTest} onTestTargetHandled={() => setSelectedClassTest(null)}/>}
            {page === 'exams' && <ExamSlots data={data}/>}
            {page === 'batch' && <MyBatch email={USER.email} store={batchStore}/>}
            {page === 'fees' && <Fees data={data}/>}
            {page === 'leave' && <Leave data={data} updateData={updateData}/>}
            {page === 'feedback' && <Feedback data={data} updateData={updateData}/>}
            {page === 'certrequest' && <CertificateRequest data={data} updateData={updateData} previewMode={previewMode}/>}
            {page === 'certificates' && <Certificates data={data}/>}
            {page === 'resume' && <Resume data={data}/>}
            {page === 'notifications' && <Notifications data={data} updateData={updateData} onOpenNotification={openNotification}/>}
            {page === 'profile' && <Profile data={data} updateData={updateData} onReset={reset}/>}
            {page === 'about' && <AboutInstitute/>}
          </>
            )}
        </div>
        <footer className="app-footer">
          <span>© 2026 Student Portal</span>
          <span className={saveError ? 'footer-status-warning' : ''}><span className="footer-status-dot"/> {saveError ? 'Changes need saving' : 'All systems operational'} <span className="footer-separator">·</span> Student Portal
            </span>
        </footer>
      </main>
      {notificationUndo && (
        <div className="notification-undo-toast" role="status" aria-live="polite">
          <span className="notification-undo-copy">
            <Check size={16}/>
            <span>Marked <strong>{notificationUndo.title}</strong> as read</span>
          </span>
          <button className="notification-undo-action" onClick={undoNotificationRead}>Undo</button>
          <button
            className="notification-undo-dismiss"
            aria-label="Dismiss undo message"
            onClick={() => setNotificationUndo(null)}
          >
            <X size={16}/>
          </button>
        </div>
      )}
    </div>
    <BottomNav page={page} setPage={setPage} onMore={() => setMobileOpen(true)}/>
  </>
  )
}
const rupee = (n) => '₹' + n.toLocaleString('en-IN')

function ClassTests({ data, batchStore, updateData, selectedTest, onTestTargetHandled }) {
  const results = data.classTests || {}
  const moduleAssessments = data.moduleAssessments || {}
  const started = data.courses.filter((c) => c.completed > 0)
  const completedModules = data.courses.filter(
    (course) => course.lessons > 0 && course.completed >= course.lessons,
  )
  const completedModuleIds = completedModules.map((item) => item.id).join(',')
  const grandfatheredThroughModule = getClassTestGrandfatheredThrough(data)
  const currentCourse = getCurrentCourse(
    data.courses,
    results,
    grandfatheredThroughModule,
    data.moduleAssessments || {},
  )
  const [mod, setMod] = useState(() => currentCourse?.id ?? started[0]?.id ?? -1)
  const [pendingTest, setPendingTest] = useState(null)
  const [active, setActive] = useState(null)
  const [answers, setAnswers] = useState({})
  const [questionIndex, setQuestionIndex] = useState(0)
  const [questionDirection, setQuestionDirection] = useState('forward')
  const [viewing, setViewing] = useState(null)
  const [celebration, setCelebration] = useState(null)
  const [section, setSection] = useState('lessons')
  const [assessmentMod, setAssessmentMod] = useState(
    () => completedModules[completedModules.length - 1]?.id ?? -1,
  )
  const { confirmNavigation, registerNavigationGuard } = usePortalNavigationGuard()
  const course = started.find((c) => c.id === mod) ?? currentCourse ?? started[0] ?? null
  const assessmentCourse = completedModules.find((item) => item.id === assessmentMod) ?? null
  const assessmentResult = assessmentCourse ? moduleAssessments[assessmentCourse.id] : null
  const assessmentPassed = didPassClassTest(
    assessmentResult?.score ?? 0,
    assessmentResult?.total ?? 0,
  )
  const assessmentQuestions = assessmentCourse ? moduleAssessment(assessmentCourse) : []
  const assessmentRetakeAllowed =
    assessmentCourse && data.moduleAssessmentRetakes?.[assessmentCourse.id] === true
  const assessmentRetestState =
    assessmentResult && !assessmentPassed
      ? getRetestWindowState(assessmentResult)
      : null
  const canStartAssessment =
    Boolean(assessmentCourse) &&
    (!assessmentResult ||
      (!assessmentPassed && assessmentRetakeAllowed && assessmentRetestState === 'open'))
  const completedAssessments = Object.values(moduleAssessments)
  const pendingAssessments = completedModules.filter((item) => {
    const result = moduleAssessments[item.id]
    return !result || !didPassClassTest(result.score, result.total)
  }).length
  const averageAssessmentScore = completedAssessments.length
    ? Math.round(
        completedAssessments.reduce(
          (sum, result) => sum + percent(result.score, result.total),
          0,
        ) / completedAssessments.length,
      )
    : 0
  const openAssessment = () => {
    setAssessmentMod(completedModules[completedModules.length - 1]?.id ?? -1)
    setSection('assessment')
  }
  const availableSessions = course?.sessions.filter((s) => s.done) ?? []
  const key = (m, l) => `${m}-${l}`
  const moduleTestBlocker = getFirstMissingPreviousModuleTest(
    data.courses,
    course?.id ?? mod,
    results,
    grandfatheredThroughModule)
  const moduleIsLocked = !currentCourse || (course && course.id > currentCourse.id) || Boolean(moduleTestBlocker)
  const isLegacyModule = course ? course.id <= grandfatheredThroughModule : true
  const nextClassTest = course ? getFirstMissingClassTestForModule(course, results) : null
  const taken = Object.values(results)
  const avg = taken.length
    ? Math.round(taken.reduce((sum, result) => sum + percent(result.score, result.total), 0) / taken.length)
    : 0
  const closeCelebration = useCallback(() => setCelebration(null), [])
  const openTestResult = (info, result) => {
    setViewing(info)
    setCelebration(
      (info.kind === 'assessment'
        ? didPassClassTest(result?.score ?? 0, result?.total ?? 0)
        : isClassTestPassed(result))
        ? {
            score: result.score,
            total: result.total,
            kind: info.kind ?? 'lesson',
          }
        : null,
    )
  }
  const beginClassTest = (info) => {
    const result = results[key(info.module, info.lesson)]
    const isRetest = Boolean(result && !isClassTestPassed(result))
    if (isRetest && getRetestWindowState(result) !== 'open') return
    setPendingTest({
        ...info,
        isRetest,
        previousAttempt: result,
    })
  }
  const requestRetestAuthorization = (info, result) => {
    const id = key(info.module, info.lesson)
    const nextResult = {
        ...result,
        retestApprovalRequested: true,
        retestApprovalRequestedDate: localDateKey(),
    }
    const nextData = {
        ...data,
        classTests: { ...results, [id]: nextResult },
        notifications: [{
          id: `class-test-reauthorization-${info.module}-${info.lesson}-${Date.now()}`,
          title: 'Retest re-authorization requested',
          message: `Academic staff re-authorization requested for Module ${info.module}, Session ${info.lesson}.`,
          time: 'Just now',
          read: false,
          kind: 'class-test',
        }, ...(data.notifications || [])],
    }
    saveDemoData(nextData)
    updateData(nextData)
  }
  const requestAssessmentRetakeAuthorization = (module, result) => {
    const nextResult = {
      ...result,
      retestApprovalRequested: true,
      retestApprovalRequestedDate: localDateKey(),
    }
    const nextData = {
      ...data,
      moduleAssessments: { ...moduleAssessments, [module]: nextResult },
      notifications: [{
        id: `assessment-retake-reauthorization-${module}-${Date.now()}`,
        title: 'Assessment retake re-authorization requested',
        message: `Academic staff re-authorization requested for Module ${module}.`,
        time: 'Just now',
        read: false,
        kind: 'class-test',
      }, ...(data.notifications || [])],
    }
    saveDemoData(nextData)
    updateData(nextData)
  }
  useEffect(() => {
    if (started.some((item) => item.id === mod)) return
    setMod(currentCourse?.id ?? started[0]?.id ?? -1)
  }, [data.courses, currentCourse?.id, mod])
  useEffect(() => {
    if (completedModuleIds.split(',').includes(String(assessmentMod))) return
    setAssessmentMod(completedModules[completedModules.length - 1]?.id ?? -1)
  }, [completedModuleIds, assessmentMod])
  useEffect(() => {
    if (!selectedTest) return
    const targetModule = data.courses.find((course) => course.id === selectedTest.module)
    const targetBlocker = getFirstMissingPreviousModuleTest(
      data.courses,
      selectedTest.module,
      results,
      grandfatheredThroughModule)
    const nextTargetTest = targetModule
      ? getFirstMissingClassTestForModule(targetModule, results)
      : null
    const targetResult = results[key(selectedTest.module, selectedTest.lesson)]
    const isRetest = Boolean(targetResult && !isClassTestPassed(targetResult))
    if (
      !targetModule ||
      !currentCourse ||
      selectedTest.module > currentCourse.id ||
      targetBlocker ||
      nextTargetTest?.num !== selectedTest.lesson ||
      (isRetest && getRetestWindowState(targetResult) !== 'open')
    ) {
      onTestTargetHandled?.()
      return
    }
    setMod(selectedTest.module)
    setPendingTest({
      module: selectedTest.module,
      lesson: selectedTest.lesson,
      topic: selectedTest.topic,
      isRetest,
      previousAttempt: targetResult,
    })
    onTestTargetHandled?.()
  }, [selectedTest, onTestTargetHandled, data.courses, currentCourse, results, grandfatheredThroughModule])
  const beginPendingTest = () => {
    if (!pendingTest) return
    const isAssessment = pendingTest.kind === 'assessment'
    const previousAttempt = isAssessment
      ? moduleAssessments[pendingTest.module]
      : results[key(pendingTest.module, pendingTest.lesson)]
    if (
      pendingTest.isRetest &&
      getRetestWindowState(previousAttempt) !== 'open'
    ) {
      setPendingTest(null)
      window.alert('This retest window is not open today. Contact academic staff for approval or re-authorization.')
      return
    }
    const questionSeed = pendingTest.isRetest && !isAssessment
      ? (Date.now() % 233280) + pendingTest.module * 1000 + pendingTest.lesson * 100 + nextTestAttemptNumber(pendingTest.previousAttempt)
      : null
    const questions = isAssessment
      ? pendingTest.questions
      : lessonTest(pendingTest.module, pendingTest.lesson, questionSeed)
    setAnswers({})
    setQuestionIndex(0)
    setQuestionDirection('forward')
    setActive({ ...pendingTest, questions, questionSeed })
    setPendingTest(null)
  }
  const submitActiveTest = (allowPartial = false) => {
    if (!active) return false
    const isAssessment = active.kind === 'assessment'
    const qs = active.questions
    if (!allowPartial && Object.keys(answers).length !== qs.length) return false
    const score = scoreTest(qs, answers)
    const passed = didPassClassTest(score, qs.length)
    const previousAttempt = isAssessment
      ? moduleAssessments[active.module]
      : data.classTests?.[key(active.module, active.lesson)]
    const submittedAt = Date.now()
    const failedDate = !passed ? localDateKey() : null
    const retestAvailableDate = failedDate
      ? getNextStudentClassDate(batchStore, USER.email, new Date(), false)
      : null
    const failureNotification = passed ? [] : [{
      id: `${isAssessment ? 'module-assessment' : 'class-test'}-failed-${active.module}-${active.lesson ?? 'final'}-${submittedAt}`,
      title: isAssessment ? 'Assessment failed - retest approval required' : 'Test failed - retest approval required',
      message: isAssessment
        ? retestAvailableDate
          ? `You scored ${percent(score, qs.length)}% on the Module ${active.module} assessment. Your result has been recorded. Academic staff can authorize a retest on your next academic day, ${formatLocalDateKey(retestAvailableDate)}.`
          : `You scored ${percent(score, qs.length)}% on the Module ${active.module} assessment. Your result has been recorded. Academic staff must schedule and authorize your retest.`
        : retestAvailableDate
          ? `You scored ${percent(score, qs.length)}% on Module ${active.module}, Session ${active.lesson}. Your result has been recorded. Academic staff can authorize a retest on your next academic day, ${formatLocalDateKey(retestAvailableDate)}.`
          : `You scored ${percent(score, qs.length)}% on Module ${active.module}, Session ${active.lesson}. Your result has been recorded. Academic staff must schedule and authorize your retest.`,
      time: 'Just now',
      read: false,
      kind: 'result',
    },
        ]
    const successNotification = active.isRetest && passed
      ? [{
          id: `retest-passed-${active.kind || 'lesson'}-${active.module}-${active.lesson ?? 'assessment'}-${submittedAt}`,
          title: isAssessment ? 'Assessment Retest Passed' : 'Retest Passed - Next Session Test Unlocked',
          message: isAssessment
            ? `You passed the Module ${active.module} assessment retest. The next module can now unlock when its other requirements are complete.`
            : `You passed Module ${active.module}, Session ${active.lesson}. The next available session test is now unlocked.`,
          time: 'Just now',
          read: false,
          kind: 'result',
        }]
      : []
    const attemptNumber = nextTestAttemptNumber(previousAttempt)
    const attempt = {
          score,
          total: qs.length,
          answers,
          status: passed ? 'Passed' : 'Failed - Retest Scheduled',
          attempts: attemptNumber,
          questionSeed: active.questionSeed,
          failedDate,
          retestAvailableDate,
          retestDate: retestAvailableDate,
          retestAuthorized: false,
          retestApprovalRequested: !passed,
          retestApprovalRequestedDate: !passed ? failedDate : null,
          date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric',
          }),
        }
    const attemptWithHistory = {
      ...attempt,
      attemptHistory: appendTestAttemptHistory(previousAttempt, attempt),
    }
    const nextData = isAssessment
      ? {
          ...data,
          moduleAssessments: {
            ...moduleAssessments,
            [active.module]: attemptWithHistory,
          },
          moduleAssessmentRetakes: {
            ...(data.moduleAssessmentRetakes || {}),
            [active.module]: false,
          },
          notifications: [...failureNotification, ...successNotification, ...(data.notifications || [])],
        }
      : {
          ...data,
          classTests: {
            ...(data.classTests || {}),
            [key(active.module, active.lesson)]: attemptWithHistory,
          },
          notifications: [...failureNotification, ...successNotification, ...(data.notifications || [])],
        }
    saveDemoData(nextData)
    updateData(nextData)
    openTestResult(active, attemptWithHistory)
    setActive(null)
    setAnswers({})
    setQuestionIndex(0)
    return true
  }
  useEffect(() => {
    if (!active) return
    const leaveTest = () => {
      const answeredCount = Object.keys(answers).length
      const questionCount = active.questions.length
      const confirmed = window.confirm(
        `Leaving now will submit the test with ${answeredCount} of ${questionCount} answers saved. Unanswered questions will be marked incorrect. Submit and leave?`)
      return confirmed ? submitActiveTest(true) : false
    }
    const warnBeforeUnload = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    const submitOnPageHide = () => submitActiveTest(true)
    const unregisterGuard = registerNavigationGuard(leaveTest)
    window.addEventListener('beforeunload', warnBeforeUnload)
    window.addEventListener('pagehide', submitOnPageHide)
    return () => {
      unregisterGuard()
      window.removeEventListener('beforeunload', warnBeforeUnload)
      window.removeEventListener('pagehide', submitOnPageHide)
    }
  }, [active, answers, data, registerNavigationGuard, updateData])
  if (!course && section === 'lessons') {
    return (
      <div className="page-stack">
        <SectionHeading eyebrow="ACADEMICS" title="Class Tests" subtitle="Take a test after completing a lesson."/>
        <div className="filter-row">
          <div className="segmented">
            <button type="button" className="selected" aria-current="page">Lesson Tests</button>
            <button type="button" onClick={openAssessment}>Assessment</button>
          </div>
        </div>
        <EmptyState title="No class tests available yet" text="Tests will appear here after you complete a lesson."/>
      </div>
    )
  }
  if (active) {
    const isAssessment = active.kind === 'assessment'
    const qs = active.questions
    const answeredCount = Object.keys(answers).length
    const done = answeredCount === qs.length
    const currentQuestion = qs[questionIndex]
    const chooseAnswer = (optionIndex) => {
      setAnswers((previous) => ({ ...previous, [questionIndex]: optionIndex }))
    }
    const goToQuestion = (index, direction) => {
      if (index < 0 || index >= qs.length) return
      setQuestionDirection(direction)
      setQuestionIndex(index)
    }
    return (
      <div className="page-stack quiz-page"><SectionHeading eyebrow={isAssessment ? `MODULE ${active.module} · ASSESSMENT` : `MODULE ${active.module} · LESSON ${active.lesson}`} title={isAssessment ? 'Module Assessment' : 'Class Test'} subtitle={isAssessment ? `${active.topic} · ${qs.length} questions · 75% to pass.` : `${active.topic} · Pass with at least 75% to unlock the next session test.`} action={<button className="secondary-button" onClick={confirmNavigation}><X size={16}/> Leave test
            </button>}/>
      <div className="quiz-progress" aria-label={`Question ${questionIndex + 1} of ${qs.length}; ${answeredCount} answered`}><div className="quiz-progress-track"><div className="quiz-progress-fill" style={{ width: `${((questionIndex + 1) / qs.length) * 100}%` }}/></div><span className="quiz-progress-label"><strong>Question {questionIndex + 1}</strong> of {qs.length}<span className="quiz-progress-saved"> · {answeredCount} answered</span></span></div>
      <div key={currentQuestion.id} className={cx('quiz-question-slide', `quiz-slide-${questionDirection}`)} aria-live="polite">
        <div className="quiz-question-meta"><span>QUESTION {String(questionIndex + 1).padStart(2, '0')}</span><span>{isAssessment ? `LESSON ${String(currentQuestion.lessonNum).padStart(2, '0')}` : `${currentQuestion.options.length} answer choices`}</span></div>
        <Panel title={currentQuestion.q} action={answers[questionIndex] != null ? (
                <span className="quiz-answered"><Check size={13}/> Answer saved
                </span>
              ) : null}>
          <div className="quiz-options">{currentQuestion.options.map((option, optionIndex) => (
                <label key={optionIndex} className={cx('quiz-option', answers[questionIndex] === optionIndex && 'selected')}><input type="radio" name={currentQuestion.id} checked={answers[questionIndex] === optionIndex} onChange={() => chooseAnswer(optionIndex)}/><span className="quiz-option-letter">{String.fromCharCode(65 + optionIndex)}</span><span>{option}</span></label>))}</div>
        </Panel>
      </div>
      <div className="quiz-navigation">
        <button className="secondary-button" disabled={questionIndex === 0} onClick={() => goToQuestion(questionIndex - 1, 'back')}><ChevronLeft size={16}/> Previous
          </button>
        <span className="quiz-navigation-hint">{answers[questionIndex] == null ? 'Choose an answer to unlock Continue' : questionIndex === qs.length - 1 ? `${answeredCount} of ${qs.length} answers saved` : 'Answer saved. Continue when you’re ready.'}</span>
        {questionIndex === qs.length - 1
          ? (
            <button className={cx('primary-button', done && 'quiz-submit-ready')} disabled={!done} onClick={() => submitActiveTest()}><Send size={16}/> Submit test
            </button>
          ) : (
            <button className="primary-button quiz-next-button" disabled={answers[questionIndex] == null} onClick={() => goToQuestion(questionIndex + 1, 'forward')}>
              Continue <ChevronRight size={16}/></button>
          )}
      </div>
    </div>
    )
  }
  if (viewing) {
    const isAssessment = viewing.kind === 'assessment'
    const r = isAssessment
      ? moduleAssessments[viewing.module]
      : results[key(viewing.module, viewing.lesson)]
    const qs = isAssessment
      ? moduleAssessment(data.courses.find((item) => item.id === viewing.module))
      : lessonTest(viewing.module, viewing.lesson, r?.questionSeed)
    const passed = isAssessment
      ? didPassClassTest(r?.score ?? 0, r?.total ?? qs.length)
      : isClassTestPassed(r)
    const viewingCourse = data.courses.find((item) => item.id === viewing.module)
    const retestClearedByProgress =
      !isAssessment &&
      !passed &&
      isClassTestFailureClearedByProgress(viewingCourse, viewing.lesson, results)
    const nextSession = Number(viewing.lesson) + 1
    const startRetake = () => {
      setMod(viewing.module)
      setViewing(null)
      if (isAssessment) {
        setPendingTest({
          kind: 'assessment',
          module: viewing.module,
          topic: viewing.topic,
          questions: qs,
          isRetest: true,
          previousAttempt: r,
        })
      } else {
        beginClassTest(viewing)
      }
    }
    const requestReauthorization = () => {
      if (isAssessment) {
        requestAssessmentRetakeAuthorization(viewing.module, r)
      } else {
        requestRetestAuthorization(viewing, r)
      }
    }
    return (
      <div className="page-stack">
        {celebration && (
          <TestCelebration
            score={celebration.score}
            total={celebration.total}
            kind={celebration.kind}
            onClose={closeCelebration}
          />
        )}
        <SectionHeading eyebrow={isAssessment ? `MODULE ${viewing.module} · ASSESSMENT` : `MODULE ${viewing.module} · LESSON ${viewing.lesson}`} title={isAssessment ? `Assessment: ${r?.score ?? 0} / ${r?.total ?? qs.length}` : `Score: ${r?.score ?? 0} / ${r?.total ?? QUESTIONS_PER_TEST}`} subtitle={r?.date ? `${viewing.topic} · Taken on ${r.date}` : viewing.topic} action={<div className="flex items-center gap-2"><StatusPill>{passed ? 'Passed' : retestClearedByProgress ? 'Cleared' : 'Failed - Retest Scheduled'}</StatusPill><button className="secondary-button" onClick={() => { setViewing(null)
                  setMod(currentCourse?.id ?? mod) }}><ArrowRight size={16}/> Back to tests
              </button></div>}/>
      <div className="stats-grid three-stats"><StatCard icon={CheckCircle2} label="Correct" value={r?.score ?? 0} detail="answers" tone="green"/><StatCard icon={X} label="Wrong" value={(r?.total ?? 0) - (r?.score ?? 0)} detail="answers" tone="orange"/><StatCard icon={TrendingUp} label="Percentage" value={`${percent(r?.score, r?.total)}%`} detail={getGrade(percent(r?.score, r?.total))} tone="violet"/></div>
      {retestClearedByProgress && <div className="notice-card"><CheckCircle2 size={19}/><div><strong>Earlier retest cleared by your progress</strong><p>You have progressed beyond this session, so this older failed result will not block your next class test.</p></div></div>}
      {!passed && !retestClearedByProgress && <RetestAction result={r} isAssessment={isAssessment} onRetake={startRetake} onRequestAuthorization={requestReauthorization}/>}
      {passed && Number(r?.attempts) > 1 && <div className="notice-card"><CheckCircle2 size={19}/><div><strong>Retest passed</strong><p>{isAssessment ? 'Your updated assessment result is recorded.' : `Your next session test is now unlocked${nextSession ? ` (Session ${nextSession})` : ''}.`}</p></div></div>}
      {r?.answers
        ? (
          qs.map((q, i) => { const mine = r.answers[i]
            const ok = mine === q.answer
            return (
              <Panel key={q.id} title={`${i + 1}. ${q.q}`} action={<StatusPill>{ok ? 'Correct' : 'Wrong'}</StatusPill>}><p className="muted-text">
                  Your answer: <strong>{q.options[mine] ?? '—'}</strong>{!ok && (
                    <>
                      {' '}
                      · Correct answer: <strong>{q.options[q.answer]}</strong></>
                  )}</p></Panel>
            )
          })
        ) : (
          <div className="notice-card"><ShieldCheck size={19}/><div><strong>Historical score</strong><p>Answer-by-answer details are not available for this completed session.</p></div></div>
        )}
      </div>
    )
  }
  if (section === 'assessment') {
    return (
      <div className="page-stack">
        <SectionHeading
          eyebrow="ACADEMICS"
          title="Class Tests"
          subtitle="Take lesson tests as you complete sessions, or open a module assessment after finishing all its lessons."
        />
        <div className="filter-row">
          <div className="segmented">
            <button type="button" onClick={() => setSection('lessons')}>Lesson Tests</button>
            <button type="button" className="selected" aria-current="page">Assessment</button>
          </div>
        </div>
        <div className="stats-grid three-stats">
          <StatCard
            icon={FileCheck2}
            label="Assessments taken"
            value={completedAssessments.length}
            detail="All modules"
            tone="violet"
          />
          <StatCard
            icon={Clock3}
            label="Pending"
            value={pendingAssessments}
            detail="Completed modules"
            tone="orange"
          />
          <StatCard
            icon={TrendingUp}
            label="Average score"
            value={`${averageAssessmentScore}%`}
            detail="Across assessments taken"
            tone="green"
          />
        </div>
        {completedModules.length === 0 ? (
          <EmptyState
            title="No assessments available yet"
            text="Complete all the lessons in a module to unlock its assessment."
          />
        ) : (
          <>
            <div className="filter-row">
              <div className="segmented" aria-label="Completed modules">
                {completedModules.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={assessmentMod === item.id ? 'selected' : ''}
                    onClick={() => setAssessmentMod(item.id)}
                  >
                    Module {item.id}
                  </button>
                ))}
              </div>
            </div>
            <Panel
              title={`${assessmentCourse?.title || 'Module assessment'}`}
              subtitle={`${assessmentQuestions.length} multiple-choice questions · sampled across module sessions · 75% to pass`}
            >
              {assessmentResult ? (
                <div className="notice-card">
                  {assessmentPassed ? <CheckCircle2 size={19}/> : <Clock3 size={19}/>}
                  <div>
                    <strong>
                      {assessmentPassed
                        ? `Passed · ${assessmentResult.score} / ${assessmentResult.total}`
                        : `Failed · ${assessmentResult.score} / ${assessmentResult.total}`}
                    </strong>
                    <p>
                      {assessmentPassed
                        ? 'You met the 75% pass mark.'
                        : assessmentRetestState === 'open'
                          ? 'Academic staff authorized your retake for today. Pass with at least 75% to clear this assessment.'
                          : assessmentRetestState === 'scheduled'
                            ? `Your retake is scheduled for ${formatLocalDateKey(assessmentResult.retestAvailableDate)}. It will open after academic staff authorizes it on that day.`
                            : assessmentRetestState === 'expired'
                              ? 'Your retake window expired. Ask academic staff to re-authorize it for your next academic day.'
                              : assessmentResult.retestAvailableDate
                                ? `Academic staff can authorize a retake on ${formatLocalDateKey(assessmentResult.retestAvailableDate)}.`
                                : 'You need 75% to pass. Ask academic staff to schedule a retake on your next academic day.'}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="muted-text">
                  This assessment is available because you completed all {assessmentCourse?.lessons} lessons in this module.
                </p>
              )}
              <div className="modal-actions">
                {assessmentResult && (
                  <button
                    type="button"
                    className="outline-button"
                    onClick={() => openTestResult({
                      kind: 'assessment',
                      module: assessmentCourse.id,
                      topic: assessmentCourse.title,
                    }, assessmentResult)}
                  >
                    View result
                  </button>
                )}
                {canStartAssessment && (
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => setPendingTest({
                      kind: 'assessment',
                      module: assessmentCourse.id,
                      topic: assessmentCourse.title,
                      questions: assessmentQuestions,
                      isRetest: Boolean(assessmentResult && !assessmentPassed),
                      previousAttempt: assessmentResult,
                    })}
                  >
                    {assessmentResult ? 'Retake assessment' : 'Start assessment'}
                  </button>
                )}
              </div>
            </Panel>
          </>
        )}
        {pendingTest?.kind === 'assessment' && (
          <Modal title="Before you begin" className="quiz-instructions-modal" onClose={() => setPendingTest(null)}>
            <div className="quiz-instructions">
              <div className="quiz-instructions-intro">
                <span><ClipboardList size={22}/></span>
                <div>
                  <strong>Module assessment instructions</strong>
                  <p>Review the rules before you start. Your attempt begins when you select Start assessment.</p>
                </div>
              </div>
              <ul>
                <li><span>01</span><div><strong>{pendingTest.questions.length} questions · sampled across module sessions</strong><p>Choose one answer for each question. There is no timer.</p></div></li>
                <li><span>02</span><div><strong>75% pass mark</strong><p>If you fail, academic staff can authorize a retake on your next academic day.</p></div></li>
                <li><span>03</span><div><strong>Move at your own pace</strong><p>Select Continue to move forward or Previous to review an earlier question.</p></div></li>
                <li><span>04</span><div><strong>Leaving submits your attempt</strong><p>If you confirm that you’re leaving, saved answers are submitted and unanswered questions count as incorrect.</p></div></li>
              </ul>
            </div>
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setPendingTest(null)}>Not now</button>
              <button
                className="primary-button"
                onClick={beginPendingTest}
              >
                <ArrowRight size={15}/> Start assessment
              </button>
            </div>
          </Modal>
        )}
      </div>
    )
  }
  const pendingCount = isLegacyModule
    ? 0
    : availableSessions.filter((session) => {
        const result = results[key(course.id, session.num)]
        return (
          !isClassTestPassed(result) &&
          !isClassTestFailureClearedByProgress(course, session.num, results)
        )
      }).length
  const moduleBlockerResult = moduleTestBlocker
    ? results[key(moduleTestBlocker.course.id, moduleTestBlocker.session.num)]
    : null
  const lockMessage = moduleTestBlocker
    ? moduleBlockerResult &&
      !isClassTestPassed(moduleBlockerResult)
      ? `Retake Session ${moduleTestBlocker.session.num} in Module ${moduleTestBlocker.course.id} and pass with at least 75% before taking tests in this module.`
      : `Complete the test for Session ${moduleTestBlocker.session.num} in Module ${moduleTestBlocker.course.id} before taking tests in this module.`
    : `Complete Module ${currentCourse?.id ?? 1} before advancing to this module.`
  return (
    <div className="page-stack"><SectionHeading eyebrow="ACADEMICS" title="Class Tests" subtitle="Take completed-session tests in order. If you fail, that session's retest becomes your next test. Pass it with at least 75% to unlock the following session test."/>
    <div className="filter-row"><div className="segmented">
      <button type="button" className="selected" aria-current="page">Lesson Tests</button>
      <button type="button" onClick={openAssessment}>Assessment</button>
    </div></div>
    <div className="stats-grid three-stats"><StatCard icon={FileCheck2} label="Tests taken" value={taken.length} detail="All modules" tone="violet"/><StatCard icon={Clock3} label="Pending" value={pendingCount} detail="In this module" tone="orange"/><StatCard icon={TrendingUp} label="Average score" value={`${avg}%`} detail="Across tests taken" tone="green"/></div>
    <div className="filter-row"><div className="segmented">{started.map((c) => (
            <button key={c.id} className={cx(mod === c.id && 'selected')} onClick={() => setMod(c.id)}>
              Module {c.id}</button>))}</div></div>
    {course && course.id < currentCourse?.id && (
        <div className="notice-card"><ShieldCheck size={19}/><div><strong>Module Completed - All tests cleared</strong><p>Past module tests are read-only. Every session remains marked Passed and no retests are required.</p></div></div>
      )}
    {isLegacyModule && course && course.id >= currentCourse?.id && availableSessions.some((session) => !results[key(course.id, session.num)]) && (
        <div className="notice-card"><ShieldCheck size={19}/><div><strong>Previous module grandfathered</strong><p>This module was completed before class-test tracking began. Any recorded historical scores are shown; sessions without saved scores are exempt.</p></div></div>
      )}
    {moduleIsLocked && (
        <div className="notice-card"><LockKeyhole size={19}/><div><strong>Module tests locked</strong><p>{lockMessage}</p></div></div>
      )}
    <Panel title={course.title} subtitle={course.id < currentCourse?.id ? 'Module Completed - All tests cleared' : `${course.completed} of ${course.lessons} lessons completed`}>
      {availableSessions.length > 0 ? (
          <div className="table-scroll" role="region" aria-label="Class test results table" tabIndex={0}><table><thead><tr><th>LESSON</th><th>TOPIC</th><th>STATUS</th><th>SCORE</th><th></th></tr></thead><tbody>{(() => {
            const sequentialActiveSession = availableSessions.find(
              (session) =>
                !isClassTestPassed(results[key(course.id, session.num)]) &&
                !isClassTestFailureClearedByProgress(course, session.num, results),
            )
            return availableSessions.map((s) => {
        const r = results[key(course.id, s.num)]
        const info = { module: course.id, lesson: s.num, topic: s.topic.replace(/^Session \d+: /, ''),
                  }
        const isPastModule = course.id < currentCourse?.id
        const previousSessions = availableSessions.filter((session) => session.num < s.num)
        const allPreviousPassed = previousSessions.every(
          (session) =>
            isClassTestPassed(results[key(course.id, session.num)]) ||
            isClassTestFailureClearedByProgress(course, session.num, results),
        )
        const isGrandfathered = isLegacyModule && !r
        const isNextClassTest = sequentialActiveSession?.num === s.num
        const isClearedByProgress = isClassTestFailureClearedByProgress(course, s.num, results)
        const isFailed = r && !isClassTestPassed(r) && !isClearedByProgress
        const sequentialLocked = !isPastModule && !allPreviousPassed
        const retestState = isFailed ? getRetestWindowState(r) : null
        const hasRetestAttempt = Number(r?.attempts) > 1 ||
          r?.attemptHistory?.some((attempt) => attempt.attempt > 1)
        const lockedSession = moduleTestBlocker?.session.num ?? nextClassTest?.num ?? 1
        let status = 'Available'
        if (isPastModule) status = 'Passed'
        else if (r && isClassTestPassed(r)) status = 'Passed'
        else if (isClearedByProgress) status = 'Cleared'
        else if (isFailed && isNextClassTest && allPreviousPassed && !moduleIsLocked) {
          if (retestState === 'open') status = 'Retest Ready'
          else if (retestState === 'scheduled') status = 'Failed'
          else if (retestState === 'expired') status = 'Retest Window Expired'
          else status = 'Failed'
        } else if (isGrandfathered) status = 'Exempt'
        else if (isFailed || moduleIsLocked || !isNextClassTest) {
          status = `Locked - Pass Session ${lockedSession} First`
        }
        return (
                    <tr key={s.num}>
          <td>{s.num}</td>
          <td>{info.topic}</td>
          <td><StatusPill>{status}</StatusPill></td>
          <td>{isPastModule
            ? (
              <button className="outline-button" onClick={() => openTestResult(info, {
                ...r,
                score: r?.score >= 8 ? r.score : 8,
                total: r?.total || 10,
                status: 'Passed',
                attempts: r?.attempts || 1,
              })}>
                View score
              </button>
            )
            : r
              ? (
                <button className="outline-button" onClick={() => openTestResult(info, r)}>
                  {hasRetestAttempt && !isFailed ? 'Already taken · View score' : 'View score'}
                </button>
              )
              : null}</td>
          <td>{isPastModule
            ? null
            : r
              ? isFailed
                ? (
                  <div className="class-test-row-actions">
                    {moduleIsLocked
                      ? <span className="muted-text">{lockMessage}</span>
                      : !isNextClassTest
                        ? <StatusPill>{`Locked - Pass Session ${nextClassTest?.num ?? 1} First`}</StatusPill>
                        : retestState === 'open'
                          ? <button className="primary-button" onClick={() => beginClassTest(info)}>Retake Test</button>
                          : retestState === 'expired'
                            ? <button className="secondary-button" onClick={() => requestRetestAuthorization(info, r)}>Request academic staff re-authorization</button>
                            : null}
                  </div>
                )
                : null
              : isGrandfathered
              ? (
                          <span className="muted-text">No historical score</span>
                        ) : moduleIsLocked
                ? (
                          <span className="muted-text">{lockMessage}</span>
                        ) : isNextClassTest
                  ? (
                          <button className="primary-button" onClick={() => beginClassTest(info)}>
                            Start test
                          </button>
                        ) : (
                          <StatusPill>{`Locked - Pass Session ${nextClassTest?.num ?? 1} First`}</StatusPill>
                        )}
          </td>
        </tr>
                  )
                })
          })()}</tbody></table></div>
        ) : (
          <EmptyState title="No class tests available yet" text="Tests will appear here after you complete a lesson."/>
        )}
    </Panel>
    {pendingTest && (
        <Modal title="Before you begin" className="quiz-instructions-modal" onClose={() => setPendingTest(null)}>
      <div className="quiz-instructions">
        <div className="quiz-instructions-intro"><span><ClipboardList size={22}/></span><div><strong>{pendingTest.kind === 'assessment' ? 'Module assessment instructions' : 'Class test instructions'}</strong><p>Review the rules before you start. Your attempt begins when you select Start test.</p></div></div>
        <ul>
          <li><span>01</span><div><strong>{pendingTest.kind === 'assessment' ? `${pendingTest.questions.length} questions · sampled across module sessions` : `${lessonTest(pendingTest.module, pendingTest.lesson).length} multiple-choice questions`}</strong><p>Choose one answer for each question. There is no timer.</p></div></li>
          <li><span>02</span><div><strong>75% pass mark</strong><p>{pendingTest.isRetest ? pendingTest.kind === 'assessment' ? 'This academic-staff-authorized retest is valid today only. Pass to clear the module assessment.' : 'This academic-staff-authorized retest is valid today only. Score at least 75% to unlock the next session test.' : 'If you fail, academic staff can authorize a retest on your next academic day.'}</p></div></li>
          <li><span>03</span><div><strong>Move at your own pace</strong><p>Select Continue to move forward or Previous to review an earlier question.</p></div></li>
          <li><span>04</span><div><strong>Leaving submits your attempt</strong><p>If you confirm that you’re leaving, saved answers are submitted and unanswered questions count as incorrect.</p></div></li>
        </ul>
      </div>
      <div className="modal-actions"><button className="secondary-button" onClick={() => setPendingTest(null)}>
              Not now
            </button><button className="primary-button" onClick={beginPendingTest}><ArrowRight size={15}/> Start test
            </button></div>
    </Modal>
      )}
    </div>
  )
}

function ExamSlots({ data }) {
  const [f, setF] = useState('All')
  const currentCourse = getCurrentCourse(
    data.courses,
    data.classTests || {},
    getClassTestGrandfatheredThrough(data),
    data.moduleAssessments || {},
  )
  const open = new Set(data.courses.filter((course) => course.id <= (currentCourse?.id ?? 0)).map((course) => course.code))
  const MY = EXAM_SLOTS.filter((e) => open.has(e.code))
  const rows = MY.filter((e) => f === 'All' || e.status === f)
  return (
    <div className="page-stack">
      <SectionHeading
        className="exam-slots-heading"
        eyebrow="EXAMINATIONS"
        title="Exam Slots"
        subtitle="Your allotted exam dates, times, venues, seats and marks."
      />
      <div className="stats-grid three-stats">
        <StatCard icon={NotebookPen} label="Total exams" value={MY.length} detail="This module" tone="violet"/>
        <StatCard icon={Clock3} label="Upcoming" value={MY.filter((e) => e.status === 'Upcoming').length} detail="Scheduled ahead" tone="orange"/>
        <StatCard icon={CheckCircle2} label="Completed" value={MY.filter((e) => e.status === 'Completed').length} detail="Already written" tone="green"/>
      </div>
      <div className="filter-row">
        <div className="segmented">
          {['All', 'Upcoming', 'Completed'].map((status) => (
            <button
              key={status}
              className={f === status ? 'selected' : ''}
              onClick={() => setF(status)}
            >
              {status}
            </button>
          ))}
        </div>
      </div>
      <Panel title="Exam schedule" subtitle="Reach the venue 20 minutes early">
        <div className="table-scroll" role="region" aria-label="Exam schedule table" tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th>SUBJECT</th>
                <th>TYPE</th>
                <th>DATE</th>
                <th>TIME SLOT</th>
                <th>VENUE</th>
                <th>SEAT</th>
                <th>MARKS</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((exam) => (
                <tr key={exam.id}>
                  <td><strong className="normal-weight">{exam.subject}</strong><br/><span className="muted-text">{exam.code}</span></td>
                  <td>{exam.type}</td>
                  <td>{exam.date}</td>
                  <td>{exam.time}</td>
                  <td><MapPin size={13}/> {exam.venue}</td>
                  <td><span className="course-tag">{exam.seat}</span></td>
                  <td><strong>{exam.maxMarks ? `${exam.maxMarks} marks` : '—'}</strong></td>
                  <td><StatusPill>{exam.status}</StatusPill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="notice-card">
        <ShieldCheck size={19}/>
        <div>
          <strong>Exam guidelines</strong>
          <p>Carry your student ID and hall ticket. Module 2 Theory and Practical exams are each worth 100 marks. Phones are not allowed inside the exam hall.</p>
        </div>
      </div>
    </div>
  )
}

function Fees({ data }) {
  const fees = getFeesForCourses(
    data.courses,
    USER.email === DEMO_USER.email ? FEES : [],
    data.classTests || {},
    getClassTestGrandfatheredThrough(data),
    data.moduleAssessments || {},
  )
  const [r, setR] = usePortalState('feeReceipt', null)
  const receiptDetails = r ? buildFeeReceiptData(r, fees, USER) : null
  const paid = fees.filter((x) => x.status === 'Paid').reduce((a, b) => a + b.amount, 0)
  const totalCourseFees = fees.reduce((total, fee) => total + (fee.amount ?? 0), 0)
  const [filter, setFilter] = useState('All')
  const shown = fees.filter((fee) => filter === 'All' || fee.status === filter)
  const summary = [
    { icon: Clock3, label: 'Pending', value: fees.filter((fee) => fee.status === 'Pending').length,
    },
    { icon: CheckCircle2, label: 'Paid', value: fees.filter((fee) => fee.status === 'Paid').length,
    },
    { icon: FileText, label: 'Total course fees', value: rupee(totalCourseFees) },
    { icon: Wallet, label: 'Amount paid', value: rupee(paid) },
  ]
  return (
    <div className="page-stack fees-page">
    <SectionHeading className="fees-heading" eyebrow="FINANCE" title="Fees Payment" subtitle="Module-wise fees and payment records."/>
    <div className="fee-summary">{summary.map(({ icon: Icon, label, value }) => (
          <div className="fee-summary-item" key={label}><span className="fee-summary-icon"><Icon size={21}/></span><div><strong>{value}</strong><span>{label}</span></div></div>))}</div>
    <section className="fee-challans" aria-label="Module fee challans">
      <div className="fee-list-heading"><h3><FileText size={19}/> Fee Challans
          </h3><select className="select-control" aria-label="Filter fee status" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="All">All modules</option><option>Pending</option><option>Paid</option><option>Not issued</option></select></div>
      <div className="fee-card-list">{shown.map((fee) => (
            <article className={cx('fee-challan', `fee-challan-${fee.status.toLowerCase().replaceAll(' ', '-')}`)} key={fee.id}>
        <header className="fee-challan-header">
          <div className="fee-challan-meta">
            <span className="fee-challan-id">{fee.id}</span>
            <StatusPill>{fee.status}</StatusPill>
          </div>
          <h4>{fee.title}</h4>
          <div className="fee-tags"><span><GraduationCap size={14}/> Module {fee.module}</span><span>{fee.code}</span></div>
        </header>
        <dl className="fee-details">
          <div><dt>Amount</dt><dd className="fee-amount">{fee.amount === null ? 'Not set' : rupee(fee.amount)}</dd></div>
          <div><dt>{fee.status === 'Paid' ? 'Paid on' : 'Due date'}</dt><dd className={fee.status === 'Paid' && fee.date ? 'fee-date-highlight' : ''}><CalendarDays size={15}/>{fee.date || 'Not scheduled'}</dd></div>
        </dl>
        {fee.receipt && (
                <div className="fee-transaction"><span><FileText size={14}/>{fee.receipt}</span><span><Wallet size={14}/>{fee.method}</span></div>
              )}
        <div className="fee-card-actions">{fee.status === 'Paid' && fee.receipt ? (
                  <Button variant="outline" className="outline-button" onClick={() => setR(fee)}><FileText size={16}/> Receipt
                  </Button>
                ) : (
                  <span className="fee-awaiting">{fee.amount === null ? 'Awaiting fee confirmation' : 'Payment not recorded'}</span>
                )}</div>
      </article>))}</div>
      {shown.length === 0 && <EmptyState title="No matching challans" text="No payment records match this status."/>}
    </section>
    {r && receiptDetails && (
        <Modal title={`Receipt ${r.receipt}`} onClose={() => setR(null)} wide className="fee-receipt-modal" portal>
      <div className="fee-receipt-preview">
        <div className="fee-receipt-preview-head"><img src={feeReceiptLogo} alt="Skill AI"/><span>FEE RECEIPT</span></div>
        <div className="fee-receipt-meta"><span><b>Receipt No.</b> {receiptDetails.receiptNumber}</span><span><b>Date</b> {receiptDetails.date}</span></div>
        <section className="fee-receipt-section">
          <h4>1. STUDENT DETAILS</h4>
          <div className="fee-receipt-rows">
            <div className="fee-receipt-row"><span>Student Name</span><strong>{receiptDetails.studentName}</strong></div>
            <div className="fee-receipt-row"><span>Admission No.</span><strong>{receiptDetails.admissionNumber}</strong></div>
            <div className="fee-receipt-row"><span>Course / Batch</span><strong>{receiptDetails.courseBatch}</strong></div>
          </div>
        </section>
        <section className="fee-receipt-section">
          <h4>2. PAYMENT TOWARDS &amp; MODE</h4>
          <div className="fee-receipt-rows">
            <div className="fee-receipt-row"><span>Payment towards</span><div className="fee-receipt-options">{['Registration', 'Instalments', 'Exam fee', 'Other'].map((option) => (
                      <span key={option}><i aria-hidden="true">{receiptDetails.paymentType === option ? '✓' : ''}</i>{option === 'Other' && receiptDetails.paymentType === option ? 'Other: ______' : option}</span>))}</div></div>
            <div className="fee-receipt-row"><span>Payment mode</span><div className="fee-receipt-mode"><div className="fee-receipt-options">{['Cash', 'UPI', 'Cheque', 'Bank transfer'].map((option) => (
                        <span key={option}><i aria-hidden="true">{receiptDetails.paymentMode.selected === option ? '✓' : ''}</i>{option}</span>))}</div>{receiptDetails.paymentMode.selected === 'Other' && <strong>Other: {receiptDetails.paymentMode.other}</strong>}</div></div>
          </div>
        </section>
        <section className="fee-receipt-section">
          <h4>3. PAYMENT DETAILS</h4>
          <div className="fee-receipt-rows">
            <div className="fee-receipt-row"><span>Amount received (Rs.)</span><strong>{rupee(receiptDetails.amount)}</strong></div>
            <div className="fee-receipt-row"><span>Amount in words</span><strong>{receiptDetails.amountInWords}</strong></div>
          </div>
        </section>
        <section className="fee-receipt-section">
          <h4>4. BALANCE &amp; DUE DATE</h4>
          <div className="fee-receipt-rows">
            <div className="fee-receipt-row"><span>Balance fee after this payment (Rs.)</span><strong>{rupee(receiptDetails.balance)}</strong></div>
            <div className="fee-receipt-row"><span>Next due date</span><strong>{receiptDetails.nextDueDate}</strong></div>
          </div>
        </section>
        <div className="fee-receipt-signatures"><strong>Accounts Officer</strong><div><span></span><strong>Sign / Date</strong></div></div>
      </div>
      <div className="modal-actions"><Button variant="outline" className="secondary-button" onClick={() => setR(null)}>
              Close
            </Button><button className="primary-button" onClick={() => downloadFeeReceipt(r, fees)}><Download size={15}/> Download receipt
            </button></div>
    </Modal>
      )}
  </div>
  )
}
