import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Code2,
  ExternalLink,
  Github,
  Globe2,
  Layers3,
  LockKeyhole,
  LogOut,
  Mail,
  Menu,
  Plus,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { api } from './api.js';
import './portfolio.css';

const initialPortfolio = {
  name: 'Rubaya',
  role: 'Full-Stack Developer',
  location: 'Indonesia',
  headline: 'Membangun pengalaman digital yang terasa sederhana, bekerja dengan fondasi yang kuat.',
  about: 'Saya mengembangkan aplikasi web dari antarmuka hingga API dan database. Saya tertarik mengubah kebutuhan nyata menjadi produk yang mudah digunakan, dapat diandalkan, dan siap berkembang.',
  email: '',
  phone: '',
  github: '',
  linkedin: '',
  website: '',
  photo: '/portfolio-photo.jpeg',
  availability: 'Terbuka untuk peluang yang tepat',
  skills: ['React', 'Node.js', 'Express', 'MySQL', 'JavaScript', 'REST API', 'Git'],
  projects: [{
    id: 'pondokpay',
    name: 'PondokPay',
    category: 'Fintech · Education',
    description: 'Platform pembayaran nontunai untuk menghubungkan pondok, santri, orang tua, dan kantin. Dilengkapi dashboard berbasis peran, ledger transaksi, kontrol uang saku, katalog, dan integrasi pembayaran.',
    role: 'Full-stack development',
    year: '2026',
    stack: ['React', 'Node.js', 'Express', 'MySQL', 'JWT'],
    liveUrl: 'https://pondokpay.rubaya.tech',
    repositoryUrl: '',
    featured: true,
  }],
  experience: [],
  services: ['Full-stack web development', 'REST API & backend', 'Database design', 'Responsive UI'],
};

const clone = (value) => JSON.parse(JSON.stringify(value));
const safeUrl = (value) => {
  if (!value) return '';
  try {
    const url = new URL(value);
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) ? url.href : '';
  } catch {
    return value.startsWith('/') && !value.startsWith('//') && !value.includes('..') ? value : '';
  }
};

function PortfolioHeader({ profile }) {
  return (
    <header className="pf-header">
      <a className="pf-wordmark" href="/portfolio" aria-label="Rubaya, beranda portofolio">
        <span className="pf-monogram">R.</span><span>{profile.name}<small>INDEPENDENT DEVELOPER</small></span>
      </a>
      <nav className="pf-nav" aria-label="Navigasi portofolio">
        <a href="#work">Karya <span>01</span></a>
        <a href="#about">Tentang <span>02</span></a>
        <a href="#contact">Kontak <span>03</span></a>
      </nav>
      <a className="pf-header-cta" href="#contact">Mari terhubung <ArrowUpRight size={15} /></a>
    </header>
  );
}

function PortfolioLanding() {
  const [profile, setProfile] = useState(initialPortfolio);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loadError, setLoadError] = useState('');
  const featuredProject = useMemo(
    () => profile.projects.find((project) => project.featured) || profile.projects[0],
    [profile.projects],
  );

  useEffect(() => {
    document.title = `${profile.name} — ${profile.role}`;
    api.get('/portfolio').then((result) => {
      if (result.data) {
        setProfile({ ...initialPortfolio, ...result.data });
        setLoadError('');
      }
    }).catch((error) => {
      console.error('Load public portfolio failed:', error);
      setLoadError('Data portofolio terbaru belum dapat dimuat.');
    });
  }, []);

  return (
    <main className="portfolio-page">
      <PortfolioHeader profile={profile} />
      {menuOpen && <div className="pf-mobile-nav"><a onClick={() => setMenuOpen(false)} href="#work">Karya</a><a onClick={() => setMenuOpen(false)} href="#about">Tentang</a><a onClick={() => setMenuOpen(false)} href="#contact">Kontak</a></div>}
      <button className="pf-mobile-menu" type="button" aria-label={menuOpen ? 'Tutup menu' : 'Buka menu'} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>
      {loadError && <p className="pf-load-error">{loadError}</p>}

      <section className="pf-hero" aria-labelledby="portfolio-heading">
        <div className="pf-hero-copy">
          <div className="pf-kicker"><span className="pf-status-dot" /> PORTFOLIO / 2026 <span className="pf-kicker-line" /> {profile.location}</div>
          <h1 id="portfolio-heading">Digital ideas,<br /><span>built to</span> <em>matter.</em></h1>
          <div className="pf-hero-bottom">
            <div><p className="pf-role">{profile.role} <span>↗</span></p><p className="pf-hero-description">{profile.headline}</p></div>
            <a className="pf-round-link" href="#work" aria-label="Jelajahi hasil karya"><ArrowDown size={20} /></a>
          </div>
        </div>
        <div className="pf-hero-art" aria-label="Profil Rubaya">
          <div className="pf-art-orbit pf-art-orbit-one" />
          <div className="pf-art-orbit pf-art-orbit-two" />
          <div className="pf-art-spark"><Sparkles size={16} /></div>
          <div className="pf-photo-frame"><img src={safeUrl(profile.photo) || '/portfolio-photo.jpeg'} alt={`Foto ${profile.name}`} /></div>
          <div className="pf-art-index">ID<span>·</span>26</div>
          <div className="pf-code-chip"><Code2 size={15} /><span>crafting interfaces</span><i>●</i></div>
        </div>
        <div className="pf-hero-index"><span>SCROLL TO EXPLORE</span><span>01 — 04</span></div>
      </section>

      <section className="pf-marquee" aria-label="Teknologi">
        <div className="pf-marquee-track">{[...profile.skills, ...profile.skills].map((skill, index) => <span key={`${skill}-${index}`}>{skill}<i>✳</i></span>)}</div>
      </section>

      <section className="pf-work pf-section" id="work">
        <div className="pf-section-heading">
          <span className="pf-section-index">SELECTED WORK <b>01 / 03</b></span>
          <h2>Small details.<br /><span>Big picture.</span></h2>
          <p>Produk nyata, keputusan desain yang terukur, dan rekayasa yang bekerja di balik layar.</p>
        </div>
        {featuredProject && (
          <article className="pf-featured-project">
            <div className="pf-project-visual">
              <div className="pf-project-topline"><span>PONDOKPAY / DIGITAL ECOSYSTEM</span><span>2026</span></div>
              <div className="pf-dashboard-art">
                <div className="pf-dash-sidebar"><span className="pf-dash-logo">P.</span><i /><i /><i /><i /></div>
                <div className="pf-dash-main">
                  <div className="pf-dash-heading"><span>Ringkasan</span><span className="pf-dash-avatar">R</span></div>
                  <div className="pf-dash-cards"><i /><i /><i /></div>
                  <div className="pf-dash-chart"><div /><div /><div /><div /><div /><div /><div /></div>
                  <div className="pf-dash-table"><i /><i /><i /><i /></div>
                </div>
              </div>
              <div className="pf-project-stamp"><span>LIVE</span><ArrowUpRight size={16} /></div>
            </div>
            <div className="pf-project-copy">
              <div className="pf-project-meta"><span>{featuredProject.category}</span><span>{featuredProject.year}</span></div>
              <h3>{featuredProject.name}<span>.</span></h3>
              <p>{featuredProject.description}</p>
              <p className="pf-project-role"><b>PERAN</b> {featuredProject.role}</p>
              <div className="pf-project-stack">{featuredProject.stack.map((item) => <span key={item}>{item}</span>)}</div>
              <div className="pf-project-links">
                {safeUrl(featuredProject.liveUrl) && <a href={safeUrl(featuredProject.liveUrl)} target="_blank" rel="noreferrer">Lihat produk <ArrowUpRight size={16} /></a>}
                {safeUrl(featuredProject.repositoryUrl) && <a href={safeUrl(featuredProject.repositoryUrl)} target="_blank" rel="noreferrer"><Github size={15} /> Repository</a>}
              </div>
            </div>
          </article>
        )}
        {profile.projects.filter((project) => project.id !== featuredProject?.id).length > 0 && (
          <div className="pf-project-list">
            {profile.projects.filter((project) => project.id !== featuredProject?.id).map((project, index) => (
              <article className="pf-project-row" key={project.id}>
                <span>0{index + 2}</span><div><small>{project.category} · {project.year}</small><h3>{project.name}</h3></div>
                <p>{project.description}</p>
                <a href={safeUrl(project.liveUrl) || '#contact'} aria-label={`Buka ${project.name}`}><ArrowUpRight size={19} /></a>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="pf-about pf-section" id="about">
        <div className="pf-about-art"><div className="pf-about-circle"><span>R.</span></div><div className="pf-about-caption">CURIOSITY<br />INTO CRAFT</div><div className="pf-about-coordinates">6°12' S<br />106°49' E</div></div>
        <div className="pf-about-copy">
          <span className="pf-section-index">A LITTLE ABOUT ME <b>02 / 03</b></span>
          <h2>Code is the tool.<br /><em>People</em> are the point.</h2>
          <p>{profile.about}</p>
          <div className="pf-skills">
            <span className="pf-mini-label">MY TOOLKIT</span>
            <div>{profile.skills.map((skill) => <span key={skill}>{skill}</span>)}</div>
          </div>
          {profile.experience.length > 0 && (
            <div className="pf-experience">
              <span className="pf-mini-label">EXPERIENCE</span>
              {profile.experience.map((item) => <article key={item.id}><small>{item.period}</small><strong>{item.title}</strong><span>{item.organization}</span><p>{item.description}</p></article>)}
            </div>
          )}
        </div>
      </section>

      <section className="pf-services pf-section">
        <div className="pf-services-intro"><span className="pf-section-index">WHAT I BRING <b>03 / 03</b></span><h2>From the first<br />sketch to <em>ship.</em></h2></div>
        <div className="pf-service-list">{profile.services.map((service, index) => <div key={service}><span>0{index + 1}</span><strong>{service}</strong><ArrowUpRight size={17} /></div>)}</div>
      </section>

      <footer className="pf-footer" id="contact">
        <div className="pf-footer-top"><span>HAVE SOMETHING GOOD IN MIND?</span><span>AVAILABLE FOR THE RIGHT OPPORTUNITY <i /></span></div>
        <a className="pf-footer-title" href={profile.email ? `mailto:${profile.email}` : '#contact'}>{profile.email || 'Let’s build'}<ArrowUpRight size={42} /></a>
        <p>{profile.availability}</p>
        <div className="pf-footer-bottom"><span>© {new Date().getFullYear()} {profile.name}. BUILT WITH INTENTION.</span><div>{safeUrl(profile.email ? `mailto:${profile.email}` : '') && <a href={`mailto:${profile.email}`}><Mail size={15} /> Email</a>}{profile.phone && <a href={`tel:${profile.phone.replace(/[^\d+]/g, '')}`}>Telepon</a>}{safeUrl(profile.github) && <a href={safeUrl(profile.github)} target="_blank" rel="noreferrer"><Github size={16} /> GitHub</a>}{safeUrl(profile.linkedin) && <a href={safeUrl(profile.linkedin)} target="_blank" rel="noreferrer">LinkedIn <ExternalLink size={14} /></a>}{safeUrl(profile.website) && <a href={safeUrl(profile.website)} target="_blank" rel="noreferrer"><Globe2 size={15} /> Website</a>}<a className="pf-admin-link" href="/portfolio/admin"><LockKeyhole size={13} /> Kelola portofolio</a></div></div>
      </footer>
    </main>
  );
}

function PasswordField({ label, value, onChange, autoComplete = 'new-password', minLength }) {
  return <label className="pf-field"><span>{label}</span><input type="password" value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} minLength={minLength} required /></label>;
}

function PortfolioAuth({ setupAvailable, configured, onAuthenticated }) {
  const [mode, setMode] = useState(configured ? 'login' : 'setup');
  const [password, setPassword] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const isSetup = mode === 'setup';

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (isSetup) {
        const result = await api.post('/portfolio/auth/setup', { setupToken, password });
        setMessage(result.message);
        setSetupToken('');
        setPassword('');
        setMode('login');
      } else {
        const result = await api.post('/portfolio/auth/login', { password });
        onAuthenticated(result.token);
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="pf-admin-shell">
      <a href="/portfolio" className="pf-admin-back"><ArrowLeft size={16} /> Kembali ke portofolio</a>
      <section className="pf-auth-card">
        <div className="pf-auth-brand"><span className="pf-monogram">R.</span><span>PRIVATE STUDIO <small>PORTFOLIO MANAGEMENT</small></span></div>
        <div className="pf-auth-icon"><ShieldCheck size={23} /></div>
        <span className="pf-section-index">{isSetup ? 'ONE-TIME SECURE SETUP' : 'PRIVATE ACCESS'}</span>
        <h1>{isSetup ? 'Atur ruang<br />kerja Anda.' : 'Selamat datang<br />kembali.'}</h1>
        <p>{isSetup ? 'Buat kata sandi khusus untuk mengelola profil dan karya Anda. Gunakan token aktivasi yang disiapkan di server.' : 'Masuk menggunakan kata sandi khusus pengelola portofolio.'}</p>
        {error && <div className="pf-alert pf-alert-error" role="alert">{error}</div>}
        {message && <div className="pf-alert pf-alert-success" role="status">{message}</div>}
        {isSetup && !setupAvailable ? (
          <div className="pf-alert">Aktivasi awal perlu disiapkan oleh administrator server menggunakan token rahasia satu kali. Setelah server siap, muat ulang halaman ini.</div>
        ) : (
          <form onSubmit={submit}>
            {isSetup && <label className="pf-field"><span>Token aktivasi satu kali</span><input type="password" value={setupToken} onChange={(event) => setSetupToken(event.target.value)} autoComplete="off" required /></label>}
            <PasswordField label={isSetup ? 'Buat kata sandi (minimal 12 karakter)' : 'Kata sandi'} value={password} onChange={setPassword} autoComplete={isSetup ? 'new-password' : 'current-password'} minLength={isSetup ? 12 : undefined} />
            <button className="pf-button-primary pf-auth-submit" type="submit" disabled={busy}>{busy ? 'Memproses…' : isSetup ? 'Aktifkan pengaturan' : 'Masuk dengan aman'} <ArrowRight size={17} /></button>
          </form>
        )}
        {configured && <button className="pf-auth-switch" onClick={() => { setMode(isSetup ? 'login' : 'setup'); setError(''); setMessage(''); }} type="button">{isSetup ? 'Kembali ke halaman masuk' : 'Aktivasi satu kali'}</button>}
        <div className="pf-auth-foot"><LockKeyhole size={14} /> Password di-hash di server. Sesi admin tidak disimpan di browser.</div>
      </section>
      <div className="pf-auth-ornament" aria-hidden="true"><div>R.</div><span>KEEP<br />BUILDING<br />WITH INTENT.</span></div>
    </main>
  );
}

const tabs = [
  { id: 'overview', label: 'Ringkasan', icon: Layers3 },
  { id: 'profile', label: 'Profil', icon: UserRound },
  { id: 'projects', label: 'Proyek', icon: Code2 },
  { id: 'experience', label: 'Pengalaman', icon: Sparkles },
  { id: 'security', label: 'Keamanan', icon: ShieldCheck },
];

function TextInput({ label, value, onChange, type = 'text', placeholder, wide = false, required = false }) {
  return <label className={`pf-editor-field${wide ? ' pf-editor-wide' : ''}`}><span>{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} /></label>;
}

function TextArea({ label, value, onChange, placeholder, wide = false, required = false }) {
  return <label className={`pf-editor-field${wide ? ' pf-editor-wide' : ''}`}><span>{label}</span><textarea rows={4} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} /></label>;
}

function PortfolioEditor({ token, onLogout }) {
  const [profile, setProfile] = useState(clone(initialPortfolio));
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [showProject, setShowProject] = useState(false);
  const [showExperience, setShowExperience] = useState(false);
  const [projectDraft, setProjectDraft] = useState(null);
  const [experienceDraft, setExperienceDraft] = useState(null);

  useEffect(() => {
    api.get('/portfolio', token).then((result) => {
      if (result.data) setProfile({ ...clone(initialPortfolio), ...result.data });
    }).catch((requestError) => {
      if (requestError.status === 401) onLogout();
      else setError(requestError.message);
    }).finally(() => setLoading(false));
  }, [token, onLogout]);

  const update = (key, value) => setProfile((current) => ({ ...current, [key]: value }));
  const save = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await api.put('/portfolio/content', profile, token);
      setNotice(result.message);
      window.setTimeout(() => setNotice(''), 3500);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };
  const changePassword = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (passwordForm.newPassword !== passwordForm.confirm) {
      setError('Konfirmasi kata sandi baru belum cocok.');
      return;
    }
    setPasswordBusy(true);
    try {
      const result = await api.patch('/portfolio/auth/password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      }, token);
      setNotice(result.message);
      setPasswordForm({ currentPassword: '', newPassword: '', confirm: '' });
      window.setTimeout(onLogout, 900);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setPasswordBusy(false);
    }
  };
  const addOrUpdateProject = (event) => {
    event.preventDefault();
    const project = { ...projectDraft, stack: projectDraft.stackText.split(',').map((item) => item.trim()).filter(Boolean) };
    delete project.stackText;
    const exists = profile.projects.some((item) => item.id === project.id);
    update('projects', exists ? profile.projects.map((item) => item.id === project.id ? project : item) : [...profile.projects, project]);
    setShowProject(false);
    setProjectDraft(null);
  };
  const addOrUpdateExperience = (event) => {
    event.preventDefault();
    const exists = profile.experience.some((item) => item.id === experienceDraft.id);
    update('experience', exists ? profile.experience.map((item) => item.id === experienceDraft.id ? experienceDraft : item) : [...profile.experience, experienceDraft]);
    setShowExperience(false);
    setExperienceDraft(null);
  };
  const startProject = (project) => {
    setProjectDraft(project ? { ...project, stackText: project.stack.join(', ') } : {
      id: `project-${Date.now()}`, name: '', category: '', description: '', role: '',
      year: new Date().getFullYear().toString(), stack: [], stackText: '', liveUrl: '', repositoryUrl: '', featured: false,
    });
    setShowProject(true);
  };
  const startExperience = (item) => {
    setExperienceDraft(item || { id: `experience-${Date.now()}`, title: '', organization: '', period: '', description: '' });
    setShowExperience(true);
  };
  const removeProject = (id) => update('projects', profile.projects.filter((item) => item.id !== id));
  const removeExperience = (id) => update('experience', profile.experience.filter((item) => item.id !== id));
  const activeTab = tabs.find((item) => item.id === tab);

  return (
    <main className="pf-admin-app">
      <aside className="pf-sidebar">
        <a className="pf-wordmark pf-sidebar-brand" href="/portfolio"><span className="pf-monogram">R.</span><span>STUDIO<small>PORTFOLIO ADMIN</small></span></a>
        <div className="pf-sidebar-label">WORKSPACE</div>
        <nav className="pf-side-links">{tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={tab === id ? 'active' : ''} onClick={() => { setTab(id); setError(''); setNotice(''); }}><Icon size={17} />{label}{tab === id && <span>↗</span>}</button>)}</nav>
        <div className="pf-sidebar-bottom"><div className="pf-admin-avatar">{profile.name.slice(0, 1)}</div><div><strong>{profile.name}</strong><small>Portfolio owner</small></div><button type="button" onClick={onLogout} aria-label="Keluar"><LogOut size={17} /></button></div>
      </aside>
      <section className="pf-admin-main">
        <header className="pf-admin-top"><div><a href="/portfolio"><ArrowLeft size={15} /> Lihat portofolio publik</a><span>Workspace <b>/</b> {activeTab?.label}</span></div><div className="pf-admin-top-right"><span><i /> Tersimpan di server</span><button className="pf-button-primary" type="button" onClick={save} disabled={saving || loading}><Save size={15} /> {saving ? 'Menyimpan…' : 'Simpan perubahan'}</button></div></header>
        <div className="pf-editor-content">
          <div className="pf-editor-heading"><div><span className="pf-section-index">PORTFOLIO STUDIO <b>{tabs.findIndex((item) => item.id === tab) + 1} / 05</b></span><h1>{activeTab?.label}<span>.</span></h1><p>Kelola cerita profesional dan tampilkan karya Anda dengan percaya diri.</p></div><div className="pf-editor-date">RUANG PRIBADI <ShieldCheck size={16} /></div></div>
          {error && <div className="pf-alert pf-alert-error" role="alert">{error}</div>}
          {notice && <div className="pf-alert pf-alert-success" role="status"><Check size={16} />{notice}</div>}
          {loading ? <div className="pf-editor-loading">Memuat data portofolio…</div> : (
            <>
              {tab === 'overview' && <div className="pf-overview-tab">
                <div className="pf-welcome-card"><div><span>STUDIO STATUS · ACTIVE</span><h2>Halo, {profile.name}.<br /><em>Karya Anda siap bersinar.</em></h2><p>Perbarui profil atau tambahkan hasil proyek baru kapan saja.</p><button className="pf-button-light" type="button" onClick={() => setTab('projects')}>Kelola karya <ArrowRight size={15} /></button></div><div className="pf-welcome-art"><div className="pf-welcome-circle">R.</div><Sparkles /></div></div>
                <div className="pf-stats-row"><article><span>PROYEK</span><strong>{String(profile.projects.length).padStart(2, '0')}</strong><small>karya di portofolio</small></article><article><span>SKILLS</span><strong>{String(profile.skills.length).padStart(2, '0')}</strong><small>teknologi & keahlian</small></article><article><span>PROFIL</span><strong>{profile.name && profile.headline ? '100%' : '70%'}</strong><small>siap ditampilkan</small></article></div>
                <div className="pf-editor-card pf-quick-preview"><div className="pf-editor-card-head"><div><span className="pf-mini-label">PUBLIC PREVIEW</span><h3>Identitas profesional</h3></div><button type="button" onClick={() => setTab('profile')}>Edit profil <ArrowUpRight size={14} /></button></div><div className="pf-quick-profile"><img src={safeUrl(profile.photo) || '/portfolio-photo.jpeg'} alt="" /><div><strong>{profile.name}</strong><span>{profile.role}</span><small>{profile.headline}</small></div><span className="pf-online-tag"><i /> Live</span></div></div>
              </div>}
              {tab === 'profile' && <section className="pf-editor-card"><div className="pf-editor-card-head"><div><span className="pf-mini-label">YOUR STORY</span><h3>Informasi profesional</h3><p>Data ini akan tampil di halaman publik.</p></div><UserRound size={19} /></div>
                <div className="pf-editor-grid">
                  <TextInput label="Nama tampilan" value={profile.name} onChange={(value) => update('name', value)} placeholder="Nama Anda" />
                  <TextInput label="Peran profesional" value={profile.role} onChange={(value) => update('role', value)} placeholder="Full-Stack Developer" />
                  <TextInput label="Lokasi" value={profile.location} onChange={(value) => update('location', value)} placeholder="Kota, Indonesia" />
                  <TextInput label="Status / availability" value={profile.availability} onChange={(value) => update('availability', value)} placeholder="Terbuka untuk peluang" />
                  <TextInput label="Email publik" value={profile.email} onChange={(value) => update('email', value)} type="email" placeholder="nama@email.com" />
                  <TextInput label="Nomor telepon (opsional)" value={profile.phone} onChange={(value) => update('phone', value)} placeholder="+62 ..." />
                  <TextInput label="Link GitHub" value={profile.github} onChange={(value) => update('github', value)} placeholder="https://github.com/username" />
                  <TextInput label="Link LinkedIn" value={profile.linkedin} onChange={(value) => update('linkedin', value)} placeholder="https://linkedin.com/in/username" />
                  <TextInput label="Website lain" value={profile.website} onChange={(value) => update('website', value)} placeholder="https://website.com" />
                  <TextInput label="Path / URL foto" value={profile.photo} onChange={(value) => update('photo', value)} placeholder="/portfolio-photo.jpeg" />
                  <TextInput label="Headline portofolio" value={profile.headline} onChange={(value) => update('headline', value)} placeholder="Hal unik yang Anda bangun" wide />
                  <TextArea label="Tentang saya" value={profile.about} onChange={(value) => update('about', value)} placeholder="Ceritakan pendekatan, fokus, dan pengalaman Anda." wide />
                  <TextInput label="Skills & teknologi (pisahkan dengan koma)" value={profile.skills.join(', ')} onChange={(value) => update('skills', value.split(',').map((item) => item.trim()).filter(Boolean))} placeholder="React, Node.js, MySQL" wide />
                  <TextInput label="Layanan (pisahkan dengan koma)" value={profile.services.join(', ')} onChange={(value) => update('services', value.split(',').map((item) => item.trim()).filter(Boolean))} placeholder="Full-stack, API, database" wide />
                </div>
                <p className="pf-editor-hint"><ShieldCheck size={15} /> Semua profil bersifat publik setelah disimpan. Jangan masukkan alamat rumah, kata sandi, atau data sensitif.</p>
              </section>}
              {tab === 'projects' && <section className="pf-editor-card"><div className="pf-editor-card-head"><div><span className="pf-mini-label">YOUR WORK, YOUR STORY</span><h3>Project showcase</h3><p>Tambahkan proyek pilihan dengan teknologi dan hasil yang dapat diverifikasi.</p></div><button className="pf-button-primary" type="button" onClick={() => startProject()}><Plus size={16} /> Tambah proyek</button></div>
                <div className="pf-project-admin-list">{profile.projects.map((project) => <article key={project.id}><div className="pf-project-admin-icon"><Code2 size={19} /></div><div className="pf-project-admin-info"><div><strong>{project.name}</strong>{project.featured && <span className="pf-featured-tag">FEATURED</span>}</div><small>{project.category} · {project.year}</small><p>{project.description}</p><div className="pf-project-stack">{project.stack.map((item) => <span key={item}>{item}</span>)}</div></div><div className="pf-item-actions"><button type="button" aria-label={`Edit ${project.name}`} onClick={() => startProject(project)}><UserRound size={15} /></button><button type="button" aria-label={`Hapus ${project.name}`} onClick={() => removeProject(project.id)}><Trash2 size={15} /></button></div></article>)}</div>
                {!profile.projects.length && <div className="pf-empty-state">Portofolio Anda siap untuk karya pertama. Tambahkan proyek untuk memulainya.</div>}
              </section>}
              {tab === 'experience' && <section className="pf-editor-card"><div className="pf-editor-card-head"><div><span className="pf-mini-label">THE JOURNEY</span><h3>Pengalaman & perjalanan</h3><p>Tambahkan pengalaman profesional, pelatihan, atau sertifikasi yang relevan.</p></div><button className="pf-button-primary" type="button" onClick={() => startExperience()}><Plus size={16} /> Tambah pengalaman</button></div>
                <div className="pf-experience-admin-list">{profile.experience.map((item) => <article key={item.id}><div className="pf-exp-timeline" /><div className="pf-exp-info"><small>{item.period}</small><h4>{item.title}</h4><strong>{item.organization}</strong><p>{item.description}</p></div><div className="pf-item-actions"><button type="button" aria-label={`Edit ${item.title}`} onClick={() => startExperience(item)}><UserRound size={15} /></button><button type="button" aria-label={`Hapus ${item.title}`} onClick={() => removeExperience(item.id)}><Trash2 size={15} /></button></div></article>)}</div>
                {!profile.experience.length && <div className="pf-empty-state"><Sparkles size={19} /> Bagian ini opsional. Ceritakan perjalanan Anda kapan pun sudah siap.</div>}
              </section>}
              {tab === 'security' && <div className="pf-security-layout"><div className="pf-security-card"><span className="pf-auth-icon"><ShieldCheck size={22} /></span><span className="pf-mini-label">ACCOUNT PROTECTION</span><h3>Privat by design.</h3><p>Panel pengaturan memakai sesi API bertanda tangan yang kedaluwarsa otomatis. Kata sandi di-hash di database.</p><ul><li><Check size={14} /> Akses admin dipisahkan dari profil publik</li><li><Check size={14} /> Sesi berakhir otomatis setelah 30 menit</li><li><Check size={14} /> Kata sandi baru mencabut sesi sebelumnya</li></ul></div><form className="pf-editor-card pf-password-card" onSubmit={changePassword}><div className="pf-editor-card-head"><div><span className="pf-mini-label">ROTATE CREDENTIALS</span><h3>Ganti kata sandi</h3><p>Gunakan passphrase unik yang tidak dipakai di layanan lain.</p></div><LockKeyhole size={19} /></div><div className="pf-editor-grid pf-editor-grid-one"><PasswordField label="Kata sandi saat ini" value={passwordForm.currentPassword} onChange={(currentPassword) => setPasswordForm((form) => ({ ...form, currentPassword }))} autoComplete="current-password" /><PasswordField label="Kata sandi baru (minimal 12 karakter)" value={passwordForm.newPassword} onChange={(newPassword) => setPasswordForm((form) => ({ ...form, newPassword }))} minLength={12} /><PasswordField label="Ulangi kata sandi baru" value={passwordForm.confirm} onChange={(confirm) => setPasswordForm((form) => ({ ...form, confirm }))} minLength={12} /></div><button className="pf-button-primary" type="submit" disabled={passwordBusy}>{passwordBusy ? 'Menyimpan…' : 'Perbarui kata sandi'} <ArrowRight size={15} /></button></form></div>}
            </>
          )}
        </div>
      </section>
      {(showProject || showExperience) && <div className="pf-modal-backdrop" role="presentation" onClick={() => { setShowProject(false); setShowExperience(false); }}>
        <form className="pf-modal-card" onSubmit={showProject ? addOrUpdateProject : addOrUpdateExperience} onClick={(event) => event.stopPropagation()}>
          <div className="pf-modal-heading"><div><span className="pf-mini-label">{showProject ? 'PROJECT DETAILS' : 'EXPERIENCE DETAILS'}</span><h2>{showProject ? 'Ceritakan proyek.' : 'Tambahkan perjalanan.'}</h2></div><button type="button" aria-label="Tutup" onClick={() => { setShowProject(false); setShowExperience(false); }}><X size={18} /></button></div>
          {showProject ? <>
            <TextInput label="Nama proyek" value={projectDraft.name} onChange={(value) => setProjectDraft({ ...projectDraft, name: value })} placeholder="Nama produk / proyek" required />
            <TextInput label="Kategori" value={projectDraft.category} onChange={(value) => setProjectDraft({ ...projectDraft, category: value })} placeholder="Fintech · Education" />
            <TextInput label="Tahun" value={projectDraft.year} onChange={(value) => setProjectDraft({ ...projectDraft, year: value })} placeholder="2026" />
            <TextInput label="Peran Anda" value={projectDraft.role} onChange={(value) => setProjectDraft({ ...projectDraft, role: value })} placeholder="Full-stack development" />
            <TextArea label="Deskripsi" value={projectDraft.description} onChange={(value) => setProjectDraft({ ...projectDraft, description: value })} placeholder="Masalah, solusi, dan hasil proyek." wide required />
            <TextInput label="Stack teknologi (pisahkan koma)" value={projectDraft.stackText} onChange={(value) => setProjectDraft({ ...projectDraft, stackText: value })} placeholder="React, Node.js, MySQL" wide />
            <TextInput label="URL live" value={projectDraft.liveUrl} onChange={(value) => setProjectDraft({ ...projectDraft, liveUrl: value })} placeholder="https://..." />
            <TextInput label="URL repository" value={projectDraft.repositoryUrl} onChange={(value) => setProjectDraft({ ...projectDraft, repositoryUrl: value })} placeholder="https://github.com/..." />
            <label className="pf-check-field"><input type="checkbox" checked={projectDraft.featured} onChange={(event) => setProjectDraft({ ...projectDraft, featured: event.target.checked })} /> Tampilkan sebagai proyek utama</label>
          </> : <>
            <TextInput label="Jabatan / program" value={experienceDraft.title} onChange={(value) => setExperienceDraft({ ...experienceDraft, title: value })} placeholder="Full-stack Developer" required />
            <TextInput label="Organisasi" value={experienceDraft.organization} onChange={(value) => setExperienceDraft({ ...experienceDraft, organization: value })} placeholder="Nama perusahaan / pelatihan" required />
            <TextInput label="Periode" value={experienceDraft.period} onChange={(value) => setExperienceDraft({ ...experienceDraft, period: value })} placeholder="2025 — sekarang" />
            <TextArea label="Ringkasan kontribusi" value={experienceDraft.description} onChange={(value) => setExperienceDraft({ ...experienceDraft, description: value })} placeholder="Tanggung jawab dan hal yang dipelajari." wide />
          </>}
          <div className="pf-modal-actions"><button className="pf-button-secondary" type="button" onClick={() => { setShowProject(false); setShowExperience(false); }}>Batal</button><button className="pf-button-primary" type="submit"><Check size={15} /> Simpan ke draft</button></div>
        </form>
      </div>}
    </main>
  );
}

export default function PortfolioApp({ admin = false }) {
  const [token, setToken] = useState('');
  const [setup, setSetup] = useState({ loaded: false, configured: false, setupAvailable: false });

  useEffect(() => {
    document.title = admin ? 'Portfolio Studio — Private Access' : 'Rubaya — Full-Stack Developer';
    if (!admin) return undefined;
    let active = true;
    api.get('/portfolio/status').then((result) => {
      if (active) setSetup({ loaded: true, configured: result.configured, setupAvailable: result.setupAvailable });
    }).catch((error) => {
      console.error('Load portfolio admin status failed:', error);
      if (active) setSetup({ loaded: true, configured: true, setupAvailable: false, error: error.message });
    });
    return () => { active = false; };
  }, [admin]);

  const logout = useMemo(() => () => setToken(''), []);
  if (!admin) return <PortfolioLanding />;
  if (!setup.loaded) return <main className="pf-admin-shell"><div className="pf-editor-loading">Menyiapkan ruang privat…</div></main>;
  if (setup.error) return <main className="pf-admin-shell"><div className="pf-alert pf-alert-error">{setup.error}</div></main>;
  return token
    ? <PortfolioEditor token={token} onLogout={logout} />
    : <PortfolioAuth configured={setup.configured} setupAvailable={setup.setupAvailable} onAuthenticated={setToken} />;
}
