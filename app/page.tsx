'use client';

import './landing.css';
import { useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';

export default function Home() {
  useEffect(() => {
    // Navbar scroll shadow
    const navbar = document.getElementById('navbar');
    const handleScroll = () => {
      if (navbar) {
        navbar.classList.toggle('scrolled', window.scrollY > 10);
      }
    };
    window.addEventListener('scroll', handleScroll);

    // FAQ accordion
    const faqQuestions = document.querySelectorAll('.faq-question');
    const faqHandlers: Array<() => void> = [];
    faqQuestions.forEach((btn) => {
      const handler = () => {
        const item = btn.closest('.faq-item');
        if (!item) return;
        const isOpen = item.classList.contains('open');
        document.querySelectorAll('.faq-item').forEach((i) => i.classList.remove('open'));
        if (!isOpen) item.classList.add('open');
      };
      btn.addEventListener('click', handler);
      faqHandlers.push(handler);
    });

    // Intersection Observer for fade-up on sections
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            (e.target as HTMLElement).style.opacity = '1';
            (e.target as HTMLElement).style.transform = 'translateY(0)';
            observer.unobserve(e.target);
          }
        });
      },
      { threshold: 0.1 }
    );

    document
      .querySelectorAll('.feature-card, .problem-card, .auto-card, .pricing-card, .integration-card')
      .forEach((el) => {
        (el as HTMLElement).style.opacity = '0';
        (el as HTMLElement).style.transform = 'translateY(20px)';
        (el as HTMLElement).style.transition = 'opacity .5s ease, transform .5s ease';
        observer.observe(el);
      });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      faqQuestions.forEach((btn, i) => {
        btn.removeEventListener('click', faqHandlers[i]);
      });
      observer.disconnect();
    };
  }, []);

  return (
    <div id="landing-page">
      {/* ═══════════════════════════════════════════════════════════════
         NAVBAR
      ═══════════════════════════════════════════════════════════════ */}
      <nav id="navbar">
        <div className="container">
          <div className="nav-inner">
            <a href="#" className="nav-logo">
              <Image src="/hausdame_SinFondo2.png" alt="Hausdame" width={180} height={60} className="object-contain" style={{ display: 'block' }} />
            </a>
            <ul className="nav-links">
              <li><a href="#features">Producto</a></li>
              <li><a href="#features">Funciones</a></li>
              <li><a href="#pricing">Precios</a></li>
              <li><a href="#faq">FAQ</a></li>
            </ul>
            <div className="nav-actions">
              <Link href="/login" className="btn btn-ghost">Iniciar sesión</Link>
              <Link href="/login" className="btn btn-primary">Solicitar demo</Link>
            </div>
            <button className="nav-mobile-toggle" aria-label="Menú">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      </nav>

      {/* ═══════════════════════════════════════════════════════════════
         HERO
      ═══════════════════════════════════════════════════════════════ */}
      <section id="hero">
        <div className="container">
          <div className="hero-inner">
            <span className="tag fade-up">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <circle cx="5" cy="5" r="5" />
              </svg>
              Plataforma operativa para alquileres cortos o vacacionales
            </span>

            <h1 className="hero-headline fade-up fade-up-d1">
              Controla la operación<br className="br-lg" /> de tus <span className="highlight">propiedades.</span>
            </h1>

            <p className="hero-sub fade-up fade-up-d2">
              Hausdame conecta limpiezas, inventario, incidencias,
              equipos y accesos inteligentes en una sola plataforma operativa.
            </p>

            <div className="hero-actions fade-up fade-up-d3">
              <Link href="/login" className="btn btn-primary btn-lg">Solicitar demo</Link>
              <a href="#pricing" className="btn btn-secondary btn-lg">Probar gratis</a>
            </div>
            <p className="hero-note fade-up fade-up-d4">1 propiedad gratis · Sin tarjeta de crédito</p>

            {/* Dashboard Mockup */}
            <div className="hero-mockup fade-up fade-up-d4">
              <div className="mockup-topbar">
                <div className="mockup-dots">
                  <span></span><span></span><span></span>
                </div>
                <span className="mockup-title">Hausdame — Panel de operaciones</span>
              </div>
              <div className="mockup-body">
                <div className="mockup-sidebar">
                  <div className="mockup-sidebar-logo">Haus<span>dame</span></div>
                  <div className="sidebar-item active">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="7" height="7" />
                      <rect x="14" y="3" width="7" height="7" />
                      <rect x="3" y="14" width="7" height="7" />
                      <rect x="14" y="14" width="7" height="7" />
                    </svg>
                    Resumen
                  </div>
                  <div className="sidebar-item">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    </svg>
                    Propiedades
                  </div>
                  <div className="sidebar-item">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="9 11 12 14 22 4" />
                      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                    </svg>
                    Limpiezas
                  </div>
                  <div className="sidebar-item">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                    Inventario
                  </div>
                  <div className="sidebar-item">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    Incidencias
                  </div>
                  <div className="sidebar-item">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    Accesos
                  </div>
                </div>
                <div className="mockup-main">
                  <div className="mockup-main-header">
                    <span className="mockup-page-title">Hoy — 9 de marzo</span>
                    <span className="mockup-badge">4 propiedades activas</span>
                  </div>
                  <div className="stats-row">
                    <div className="stat-card">
                      <div className="stat-label">Limpiezas hoy</div>
                      <div className="stat-value">6</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-label">Completadas</div>
                      <div className="stat-value green">4</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-label">Pendientes</div>
                      <div className="stat-value yellow">2</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-label">Incidencias</div>
                      <div className="stat-value red">1</div>
                    </div>
                  </div>
                  <div className="task-list">
                    <div className="task-item">
                      <div className="task-dot green"></div>
                      <span className="task-text">Limpieza completada — Apartamento Centro</span>
                      <span className="task-prop">Marta G.</span>
                      <span className="task-status done">Listo</span>
                    </div>
                    <div className="task-item">
                      <div className="task-dot yellow"></div>
                      <span className="task-text">Limpieza pendiente — Villa Mediterránea</span>
                      <span className="task-prop">Carlos R.</span>
                      <span className="task-status pending">Pendiente</span>
                    </div>
                    <div className="task-item">
                      <div className="task-dot blue"></div>
                      <span className="task-text">Inventario verificado — Estudio Playa</span>
                      <span className="task-prop">Ana M.</span>
                      <span className="task-status progress">En curso</span>
                    </div>
                    <div className="task-item">
                      <div className="task-dot red"></div>
                      <span className="task-text">Incidencia: persiana rota — Ático Norte</span>
                      <span className="task-prop">Luis T.</span>
                      <span className="task-status alert">Alerta</span>
                    </div>
                    <div className="task-item">
                      <div className="task-dot green"></div>
                      <span className="task-text">Código de acceso generado — Villa Mediterránea</span>
                      <span className="task-prop">Auto</span>
                      <span className="task-status done">Activo</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust bar */}
      <div className="container">
        <div className="trust-bar">
          <div className="trust-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Sin configuraciones complejas
          </div>
          <div className="trust-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Funciona desde el día 1
          </div>
          <div className="trust-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            App móvil para tu equipo
          </div>
          <div className="trust-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Soporte en español
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
         PROBLEM
      ═══════════════════════════════════════════════════════════════ */}
      <section id="problem">
        <div className="container">
          <div className="section-header">
            <span className="tag">El problema</span>
            <h2 className="section-title">Gestionar operaciones no debería<br />requerir cinco herramientas distintas.</h2>
            <p className="section-sub">La mayoría de hosts gestionan sus propiedades con una combinación caótica de WhatsApp,
              hojas de cálculo y notas de voz. El resultado: errores, olvidos y estrés constante.</p>
          </div>
          <div className="problem-grid">
            <div className="problem-card">
              <div className="problem-icon">💬</div>
              <h3>Coordinación por WhatsApp</h3>
              <p>Las tareas de limpieza se asignan por mensajes que se pierden, se olvidan o generan confusión entre el equipo.</p>
            </div>
            <div className="problem-card">
              <div className="problem-icon">📊</div>
              <h3>Inventario en hojas de cálculo</h3>
              <p>Sin visibilidad en tiempo real de qué falta, qué se rompió o qué necesita reponerse en cada habitación.</p>
            </div>
            <div className="problem-card">
              <div className="problem-icon">📋</div>
              <h3>Incidencias reportadas informalmente</h3>
              <p>Los daños y problemas se reportan de manera desorganizada, sin fotos, sin seguimiento ni historial.</p>
            </div>
            <div className="problem-card">
              <div className="problem-icon">🔑</div>
              <h3>Códigos de acceso generados a mano</h3>
              <p>Compartir accesos por mensajes, sin control de vencimiento ni registro de quién entró y cuándo.</p>
            </div>
            <div className="problem-card">
              <div className="problem-icon">👁️</div>
              <h3>Equipos sin visibilidad</h3>
              <p>Los limpiadores no saben qué propiedad les toca ni cuándo. Los gestores no saben si la limpieza se completó.</p>
            </div>
            <div className="problem-card">
              <div className="problem-icon">⏰</div>
              <h3>Tareas olvidadas entre reservas</h3>
              <p>Sin automatización, las tareas operativas dependen de que alguien las recuerde manualmente en cada rotación.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
         SOLUTION
      ═══════════════════════════════════════════════════════════════ */}
      <section id="solution">
        <div className="container">
          <div className="section-header">
            <span className="tag" style={{ background: 'rgba(37,99,235,.2)', color: '#93c5fd' }}>La solución</span>
            <h2 className="section-title">Hausdame centraliza toda la<br />operación de tus propiedades.</h2>
            <p className="section-sub" style={{ color: 'rgba(255,255,255,.6)' }}>Conecta el flujo operativo entre cada reserva. Desde
              que llega el huésped hasta que sale, todo está coordinado y visible.</p>
          </div>
          <div className="solution-inner">
            <div className="flow-steps">
              <div className="flow-step">
                <div className="flow-num">1</div>
                <div className="flow-content">
                  <h4>Llega la reserva</h4>
                  <p>Hausdame recibe la información desde Airbnb o iCal y prepara el flujo operativo automáticamente.</p>
                </div>
              </div>
              <div className="flow-step">
                <div className="flow-num">2</div>
                <div className="flow-content">
                  <h4>Limpieza asignada automáticamente</h4>
                  <p>Se crea la tarea de limpieza, se asigna al equipo correspondiente y se notifica en la app.</p>
                </div>
              </div>
              <div className="flow-step">
                <div className="flow-num">3</div>
                <div className="flow-content">
                  <h4>Checklist completado e inventario verificado</h4>
                  <p>El limpiador sigue el checklist, documenta el estado y reporta el inventario desde el móvil.</p>
                </div>
              </div>
              <div className="flow-step">
                <div className="flow-num">4</div>
                <div className="flow-content">
                  <h4>Incidencias reportadas con evidencia</h4>
                  <p>Cualquier daño o anomalía se reporta con fotos y descripción directamente en la plataforma.</p>
                </div>
              </div>
              <div className="flow-step">
                <div className="flow-num">5</div>
                <div className="flow-content">
                  <h4>Acceso inteligente creado</h4>
                  <p>El código de acceso del huésped se genera automáticamente y expira al finalizar la reserva.</p>
                </div>
              </div>
              <div className="flow-step">
                <div className="flow-num">6</div>
                <div className="flow-content">
                  <h4>Propiedad lista para el huésped</h4>
                  <p>Todo verificado, todo documentado. El gestor recibe la confirmación en tiempo real.</p>
                </div>
              </div>
            </div>
            <div className="solution-visual">
              <div className="timeline-title">Línea de tiempo operativa</div>
              <div className="timeline">
                <div className="tl-item">
                  <div className="tl-icon" style={{ background: 'rgba(37,99,235,.15)' }}>📅</div>
                  <div className="tl-text">
                    <strong>Reserva recibida</strong>
                    <span>Airbnb · 14–17 marzo</span>
                  </div>
                  <span className="tl-time">Auto</span>
                </div>
                <div className="tl-item">
                  <div className="tl-icon" style={{ background: 'rgba(52,211,153,.15)' }}>🧹</div>
                  <div className="tl-text">
                    <strong>Limpieza programada</strong>
                    <span>17 mar · 11:00 — Marta G.</span>
                  </div>
                  <span className="tl-time" style={{ color: '#34d399' }}>Listo</span>
                </div>
                <div className="tl-item">
                  <div className="tl-icon" style={{ background: 'rgba(251,191,36,.15)' }}>📋</div>
                  <div className="tl-text">
                    <strong>Inventario verificado</strong>
                    <span>17 habitaciones · 3 repuestos</span>
                  </div>
                  <span className="tl-time" style={{ color: '#fbbf24' }}>Pendiente</span>
                </div>
                <div className="tl-item">
                  <div className="tl-icon" style={{ background: 'rgba(96,165,250,.15)' }}>🔐</div>
                  <div className="tl-text">
                    <strong>Código de acceso</strong>
                    <span>Expira 17 mar · 12:00</span>
                  </div>
                  <span className="tl-time" style={{ color: '#60a5fa' }}>Generado</span>
                </div>
                <div className="tl-item">
                  <div className="tl-icon" style={{ background: 'rgba(167,139,250,.15)' }}>👤</div>
                  <div className="tl-text">
                    <strong>Check-in del huésped</strong>
                    <span>17 mar · 15:00</span>
                  </div>
                  <span className="tl-time">Próximo</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
         FEATURES
      ═══════════════════════════════════════════════════════════════ */}
      <section id="features">
        <div className="container">
          <div className="section-header">
            <span className="tag">Funciones</span>
            <h2 className="section-title">Las herramientas operativas<br />que un PMS no te da.</h2>
            <p className="section-sub">Hausdame reúne en un solo lugar las herramientas operativas que los hosts necesitan cada día.</p>
          </div>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">🧹</div>
              <h3>Gestión de limpiezas</h3>
              <p>Programa, asigna y rastrea cada limpieza de forma automática entre reservas.</p>
              <ul className="feature-list">
                <li>Tareas programadas automáticamente</li>
                <li>Checklists personalizables</li>
                <li>Seguimiento de estado en tiempo real</li>
                <li>Asignación por equipo o limpiador</li>
              </ul>
            </div>
            <div className="feature-card">
              <div className="feature-icon">📦</div>
              <h3>Control de inventario</h3>
              <p>Conoce en todo momento el estado de los suministros en cada habitación de cada propiedad.</p>
              <ul className="feature-list">
                <li>Inventario por habitación</li>
                <li>Registro de reposiciones</li>
                <li>Evidencia fotográfica</li>
                <li>Verificación post-limpieza</li>
              </ul>
            </div>
            <div className="feature-card">
              <div className="feature-icon">⚠️</div>
              <h3>Reporte de incidencias</h3>
              <p>Centraliza los reportes de daños y mantenimiento con toda la documentación necesaria.</p>
              <ul className="feature-list">
                <li>Reporte de daños con foto</li>
                <li>Alertas de mantenimiento</li>
                <li>Historial por propiedad</li>
                <li>Visibilidad operativa completa</li>
              </ul>
            </div>
            <div className="feature-card">
              <div className="feature-icon">👥</div>
              <h3>Equipos y roles</h3>
              <p>Coordina tu equipo con roles y permisos claros para cada nivel de responsabilidad.</p>
              <ul className="feature-list">
                <li>Roles: limpiador, jefe de equipo, gestor</li>
                <li>Asignaciones por propiedad</li>
                <li>Permisos diferenciados</li>
                <li>Notificaciones en app móvil</li>
              </ul>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🔐</div>
              <h3>Accesos inteligentes</h3>
              <p>Gestiona los accesos de huéspedes y personal con códigos temporales y automatizados.</p>
              <ul className="feature-list">
                <li>Códigos temporales para huéspedes</li>
                <li>Ventanas de acceso para limpiadores</li>
                <li>Gestión remota del acceso</li>
                <li>Expiración automática</li>
              </ul>
            </div>
            <div className="feature-card">
              <div className="feature-icon">📈</div>
              <h3>Línea de tiempo operativa</h3>
              <p>Visualiza todo el ciclo operativo de cada propiedad: desde la reserva hasta el próximo check-in.</p>
              <ul className="feature-list">
                <li>Vista por propiedad y fecha</li>
                <li>Estado de limpieza e inspección</li>
                <li>Registro de check-in y checkout</li>
                <li>Preparación para la próxima reserva</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
         AUTOMATION
      ═══════════════════════════════════════════════════════════════ */}
      <section id="automation">
        <div className="container">
          <div className="section-header">
            <span className="tag">Automatización</span>
            <h2 className="section-title">Automatiza la rutina.<br />Enfócate en el negocio.</h2>
            <p className="section-sub">Hausdame se encarga de las tareas repetitivas para que tú te concentres en lo que realmente importa: crecer.</p>
          </div>
          <div className="automation-inner">
            <div className="auto-cards">
              <div className="auto-card">
                <div className="auto-card-icon">🧹</div>
                <div>
                  <h4>Limpiezas automáticas</h4>
                  <p>Cada checkout genera automáticamente una tarea de limpieza asignada al equipo correcto.</p>
                </div>
              </div>
              <div className="auto-card">
                <div className="auto-card-icon">🔔</div>
                <div>
                  <h4>Notificaciones en tiempo real</h4>
                  <p>El equipo recibe alertas en el móvil cuando hay una tarea nueva, un cambio o una urgencia.</p>
                </div>
              </div>
              <div className="auto-card">
                <div className="auto-card-icon">⚠️</div>
                <div>
                  <h4>Alertas de incidencias</h4>
                  <p>Los gestores son notificados al instante cuando se reporta un daño o problema en la propiedad.</p>
                </div>
              </div>
              <div className="auto-card">
                <div className="auto-card-icon">🔑</div>
                <div>
                  <h4>Códigos de acceso automáticos</h4>
                  <p>Los códigos para huéspedes se generan y expiran solos según las fechas de la reserva.</p>
                </div>
              </div>
            </div>
            <div className="auto-visual">
              <div className="auto-visual-title">Flujo automatizado</div>
              <div className="trigger-flow">
                <div className="trigger-item">
                  <div className="trigger-dot"></div>
                  <span className="trigger-label">Checkout confirmado en Airbnb</span>
                </div>
                <div className="connector">
                  <div className="connector-line"></div>
                  <span className="connector-text">Desencadena automáticamente</span>
                </div>
                <div className="trigger-item">
                  <div className="trigger-dot" style={{ background: '#60a5fa' }}></div>
                  <span className="trigger-label">Tarea de limpieza creada y asignada</span>
                </div>
                <div className="connector">
                  <div className="connector-line"></div>
                  <span className="connector-text"></span>
                </div>
                <div className="trigger-item">
                  <div className="trigger-dot" style={{ background: '#fbbf24' }}></div>
                  <span className="trigger-label">Notificación enviada al limpiador</span>
                </div>
                <div className="connector">
                  <div className="connector-line"></div>
                  <span className="connector-text"></span>
                </div>
                <div className="trigger-item">
                  <div className="trigger-dot" style={{ background: '#a78bfa' }}></div>
                  <span className="trigger-label">Código de acceso generado para la próxima reserva</span>
                </div>
                <div className="connector">
                  <div className="connector-line"></div>
                  <span className="connector-text"></span>
                </div>
                <div className="trigger-item">
                  <div className="trigger-dot" style={{ background: '#34d399' }}></div>
                  <span className="trigger-label">Gestor recibe confirmación de propiedad lista</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
         SMART LOCKS
      ═══════════════════════════════════════════════════════════════ */}
      <section id="smartlocks">
        <div className="container">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '56px' }}>
            <div className="section-header">
              <span className="tag">Accesos inteligentes</span>
              <h2 className="section-title">Acceso inteligente para<br />huéspedes y personal.</h2>
              <p className="section-sub">Gestiona quién entra y cuándo sin llamadas, sin WhatsApp y sin riesgo de seguridad.</p>
            </div>
            <div className="locks-inner">
              <div className="locks-visual">
                <div className="lock-card-demo">
                  <div className="lock-demo-header">
                    <span className="lock-demo-title">Accesos activos — Apartamento Centro</span>
                    <span className="lock-demo-badge pulse">● En vivo</span>
                  </div>
                  <div className="lock-entries">
                    <div className="lock-entry">
                      <div className="lock-avatar" style={{ background: '#2563eb' }}>H</div>
                      <div className="lock-info">
                        <div className="lock-name">María López (Huésped)</div>
                        <div className="lock-time">Check-in 14 mar · 15:00 → 17 mar · 11:00</div>
                      </div>
                      <div>
                        <div className="lock-code">4829</div>
                        <div className="lock-exp">Expira auto.</div>
                      </div>
                    </div>
                    <div className="lock-entry">
                      <div className="lock-avatar" style={{ background: '#059669' }}>L</div>
                      <div className="lock-info">
                        <div className="lock-name">Marta García (Limpieza)</div>
                        <div className="lock-time">17 mar · 10:00 → 13:00</div>
                      </div>
                      <div>
                        <div className="lock-code">7163</div>
                        <div className="lock-exp">3 horas</div>
                      </div>
                    </div>
                    <div className="lock-entry" style={{ opacity: .5 }}>
                      <div className="lock-avatar" style={{ background: '#6b7280' }}>H</div>
                      <div className="lock-info">
                        <div className="lock-name">Próximo huésped</div>
                        <div className="lock-time">18 mar · 15:00 → 21 mar · 11:00</div>
                      </div>
                      <div>
                        <div className="lock-code" style={{ color: 'rgba(96,165,250,.4)' }}>——</div>
                        <div className="lock-exp">Pendiente</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="locks-content">
                <div className="lock-benefit">
                  <div className="lock-benefit-icon">🔒</div>
                  <div>
                    <h4>Códigos temporales para huéspedes</h4>
                    <p>Se generan automáticamente con las fechas de la reserva y expiran solos al hacer checkout. Sin intervención manual.</p>
                  </div>
                </div>
                <div className="lock-benefit">
                  <div className="lock-benefit-icon">🕐</div>
                  <div>
                    <h4>Ventanas de acceso para el equipo de limpieza</h4>
                    <p>Define exactamente cuándo puede entrar el personal. El acceso se activa y desactiva automáticamente.</p>
                  </div>
                </div>
                <div className="lock-benefit">
                  <div className="lock-benefit-icon">📱</div>
                  <div>
                    <h4>Gestión remota desde cualquier lugar</h4>
                    <p>Controla todos los accesos desde la plataforma sin necesidad de estar físicamente en la propiedad.</p>
                  </div>
                </div>
                <div className="lock-benefit">
                  <div className="lock-benefit-icon">🛡️</div>
                  <div>
                    <h4>Seguridad sin esfuerzo</h4>
                    <p>Ningún código se reutiliza entre huéspedes. El historial de accesos queda registrado automáticamente.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
         INTEGRATIONS
      ═══════════════════════════════════════════════════════════════ */}
      <section id="integrations">
        <div className="container">
          <div className="integrations-inner">
            <div className="section-header" style={{ alignItems: 'center', textAlign: 'center' }}>
              <span className="tag">Integraciones</span>
              <h2 className="section-title">Conectado con tus<br />fuentes de reservas.</h2>
              <p className="section-sub" style={{ textAlign: 'center', margin: '0 auto' }}>Hausdame se integra con los canales que ya
                utilizas para recibir reservas y activar las operaciones automáticamente, cuando llega una reserva, la
                operación se activa sola.</p>
            </div>
            {/* Integraciones actuales */}
            <div style={{ width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-light)' }}>Integraciones actuales</span>
                <div style={{ flex: 1, height: '1px', background: 'var(--border)' }}></div>
              </div>
              <div className="integrations-grid">
                <div className="integration-card">
                  <div className="integration-logo" style={{ background: '#ff5a5f1a' }}>🏠</div>
                  <div className="integration-info">
                    <span className="integration-name">Airbnb</span>
                    <span className="integration-desc">Sincronización de reservas</span>
                  </div>
                </div>
                <div className="integration-card">
                  <div className="integration-logo" style={{ background: '#0056d21a' }}>📅</div>
                  <div className="integration-info">
                    <span className="integration-name">iCal</span>
                    <span className="integration-desc">Calendario universal</span>
                  </div>
                </div>
                <div className="integration-card">
                  <div className="integration-logo" style={{ background: '#2563eb1a' }}>🔐</div>
                  <div className="integration-info">
                    <span className="integration-name">TTLock</span>
                    <span className="integration-desc">Cerraduras inteligentes</span>
                  </div>
                </div>
              </div>
            </div>
            {/* Próximamente */}
            <div style={{ width: '100%', marginTop: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--accent)' }}>Próximamente</span>
                <div style={{ flex: 1, height: '1px', background: 'var(--accent-subtle)' }}></div>
              </div>
              <div className="integrations-grid">
                <div className="integration-card" style={{ borderStyle: 'dashed', borderColor: 'var(--accent-subtle)', opacity: .8 }}>
                  <div className="integration-logo" style={{ background: '#003b951a' }}>🏨</div>
                  <div className="integration-info">
                    <span className="integration-name" style={{ color: 'var(--text-muted)' }}>Booking.com</span>
                    <span className="integration-desc">En desarrollo</span>
                  </div>
                </div>
                <div className="integration-card" style={{ borderStyle: 'dashed', borderColor: 'var(--accent-subtle)', opacity: .8 }}>
                  <div className="integration-logo" style={{ background: '#0046871a' }}>✈️</div>
                  <div className="integration-info">
                    <span className="integration-name" style={{ color: 'var(--text-muted)' }}>Expedia</span>
                    <span className="integration-desc">En desarrollo</span>
                  </div>
                </div>
                <div className="integration-card" style={{ borderStyle: 'dashed', borderColor: 'var(--accent-subtle)', opacity: .8 }}>
                  <div className="integration-logo" style={{ background: '#1da1f21a' }}>🏖️</div>
                  <div className="integration-info">
                    <span className="integration-name" style={{ color: 'var(--text-muted)' }}>VRBO</span>
                    <span className="integration-desc">En desarrollo</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
         PRICING
      ═══════════════════════════════════════════════════════════════ */}
      <section id="pricing">
        <div className="container">
          <div className="pricing-inner">
            <div className="section-header" style={{ alignItems: 'center', textAlign: 'center' }}>
              <span className="tag">Precios</span>
              <h2 className="section-title">Precios simples que<br />crecen contigo.</h2>
              <p className="section-sub" style={{ textAlign: 'center', margin: '0 auto' }}>Empieza gratis con 1 propiedad. Escala cuando tu portfolio crezca. Sin sorpresas.</p>
            </div>
            <div className="pricing-grid">
              {/* Free */}
              <div className="pricing-card">
                <div>
                  <div className="pricing-plan">Gratis</div>
                  <div className="pricing-price" style={{ marginTop: '12px' }}>
                    <span className="free">$0</span>
                  </div>
                  <div className="pricing-props" style={{ marginTop: '8px' }}>1 propiedad · Siempre gratis</div>
                </div>
                <ul className="pricing-features-list">
                  <li><span className="check">✓</span> 1 propiedad</li>
                  <li><span className="check">✓</span> Gestión de limpiezas</li>
                  <li><span className="check">✓</span> Inventario básico</li>
                  <li><span className="check">✓</span> Reporte de incidencias</li>
                  <li><span className="check">✓</span> 2 miembros de equipo</li>
                </ul>
                <Link href="/login" className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }}>Empezar gratis</Link>
              </div>
              {/* Starter */}
              <div className="pricing-card">
                <div>
                  <div className="pricing-plan">Starter</div>
                  <div className="pricing-price" style={{ marginTop: '12px' }}>
                    <span className="amount">$15</span>
                    <span className="period">/ mes</span>
                  </div>
                  <div className="pricing-props" style={{ marginTop: '8px' }}>2–10 propiedades</div>
                  <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--accent)', fontWeight: 600 }}>Ideal para hosts pequeños</div>
                </div>
                <ul className="pricing-features-list">
                  <li><span className="check">✓</span> Hasta 10 propiedades</li>
                  <li><span className="check">✓</span> Todo del plan Gratis</li>
                  <li><span className="check">✓</span> Equipo ilimitado</li>
                  <li><span className="check">✓</span> Integración iCal</li>
                  <li><span className="check">✓</span> Accesos TTLock</li>
                </ul>
                <Link href="/login" className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }}>Comenzar</Link>
              </div>
              {/* Growth */}
              <div className="pricing-card featured">
                <div className="pricing-badge">Más popular</div>
                <div>
                  <div className="pricing-plan">Growth</div>
                  <div className="pricing-price" style={{ marginTop: '12px' }}>
                    <span className="amount">$25</span>
                    <span className="period">/ mes</span>
                  </div>
                  <div className="pricing-props" style={{ marginTop: '8px' }}>11–20 propiedades</div>
                  <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--accent)', fontWeight: 600 }}>Para property managers</div>
                </div>
                <ul className="pricing-features-list">
                  <li><span className="check">✓</span> Hasta 20 propiedades</li>
                  <li><span className="check">✓</span> Todo del plan Starter</li>
                  <li><span className="check">✓</span> Integración Airbnb</li>
                  <li><span className="check">✓</span> Automatizaciones avanzadas</li>
                  <li><span className="check">✓</span> Soporte prioritario</li>
                </ul>
                <Link href="/login" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>Comenzar</Link>
              </div>
              {/* Scale */}
              <div className="pricing-card">
                <div>
                  <div className="pricing-plan">Scale</div>
                  <div className="pricing-price" style={{ marginTop: '12px' }}>
                    <span className="amount">$35</span>
                    <span className="period">/ mes</span>
                  </div>
                  <div className="pricing-props" style={{ marginTop: '8px' }}>21–30 propiedades</div>
                </div>
                <ul className="pricing-features-list">
                  <li><span className="check">✓</span> Hasta 30 propiedades</li>
                  <li><span className="check">✓</span> Todo del plan Growth</li>
                  <li><span className="check">✓</span> Reportes avanzados</li>
                  <li><span className="check">✓</span> API access</li>
                  <li><span className="check">✓</span> Onboarding dedicado</li>
                </ul>
                <Link href="/login" className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }}>Comenzar</Link>
              </div>
            </div>
            <div className="pricing-extra" style={{ maxWidth: '480px', background: 'var(--bg)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px' }}>
              <strong>¿Más de 30 propiedades?</strong><br />
              Cada bloque adicional de 10 propiedades suma <strong>$10/mes</strong>.<br />
              <span style={{ color: 'var(--text-light)', fontSize: '13px' }}>31–40 propiedades → $45/mes · 41–50 → $55/mes · y así sucesivamente.</span>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
         FAQ
      ═══════════════════════════════════════════════════════════════ */}
      <section id="faq">
        <div className="container">
          <div className="faq-inner">
            <div className="section-header" style={{ alignItems: 'center', textAlign: 'center' }}>
              <span className="tag">FAQ</span>
              <h2 className="section-title">Preguntas frecuentes</h2>
            </div>
            <div className="faq-list">
              <div className="faq-item">
                <button className="faq-question">
                  ¿Hausdame reemplaza mi PMS o channel manager?
                  <span className="faq-icon">+</span>
                </button>
                <div className="faq-answer">
                  No. Hausdame no compite con los sistemas de gestión de reservas (PMS) ni los channel managers como Lodgify
                  o Hostaway. Mientras esos sistemas gestionan las reservas, los pagos y la distribución de canales,
                  Hausdame se encarga de la capa operativa: lo que ocurre entre reserva y reserva. Son herramientas
                  complementarias.
                </div>
              </div>
              <div className="faq-item">
                <button className="faq-question">
                  ¿Se integra con Airbnb?
                  <span className="faq-icon">+</span>
                </button>
                <div className="faq-answer">
                  Sí. Hausdame se conecta con Airbnb para importar automáticamente las fechas de reserva y activar los
                  flujos operativos correspondientes. También soporta iCal para sincronización con cualquier otra plataforma
                  de reservas.
                </div>
              </div>
              <div className="faq-item">
                <button className="faq-question">
                  ¿Mi equipo de limpieza puede usar el sistema?
                  <span className="faq-icon">+</span>
                </button>
                <div className="faq-answer">
                  Sí, y es exactamente para eso. Hausdame incluye una app móvil para que tu equipo reciba tareas, siga
                  checklists, reporte incidencias y verifique inventario directamente desde su teléfono. Puedes asignar
                  roles diferenciados: limpiador, jefe de equipo o gestor.
                </div>
              </div>
              <div className="faq-item">
                <button className="faq-question">
                  ¿Necesito cerraduras inteligentes para usar Hausdame?
                  <span className="faq-icon">+</span>
                </button>
                <div className="faq-answer">
                  No. Las cerraduras inteligentes son una funcionalidad adicional y opcional. Puedes usar Hausdame para
                  gestionar limpiezas, inventario, incidencias y equipos sin tener ningún dispositivo de acceso inteligente.
                  Cuando estés listo, puedes añadir la integración con TTLock.
                </div>
              </div>
              <div className="faq-item">
                <button className="faq-question">
                  ¿Cómo funciona el plan gratuito?
                  <span className="faq-icon">+</span>
                </button>
                <div className="faq-answer">
                  El plan gratuito incluye 1 propiedad, gestión de limpiezas, inventario básico, reporte de incidencias y
                  hasta 2 miembros de equipo. No tiene límite de tiempo, no requiere tarjeta de crédito y no caduca. Es
                  ideal para empezar a conocer la plataforma con tu primera propiedad.
                </div>
              </div>
              <div className="faq-item">
                <button className="faq-question">
                  ¿Puedo cambiar de plan en cualquier momento?
                  <span className="faq-icon">+</span>
                </button>
                <div className="faq-answer">
                  Sí. Puedes subir o bajar de plan en cualquier momento desde tu panel de configuración. Los cambios se
                  aplican en el siguiente ciclo de facturación. No hay penalizaciones ni contratos de permanencia.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
         FINAL CTA
      ═══════════════════════════════════════════════════════════════ */}
      <section id="cta">
        <div className="container">
          <div className="cta-inner">
            <h2 className="cta-headline">Las operaciones no deberían<br />depender de WhatsApp.</h2>
            <p className="cta-sub">Gestiona las operaciones de tus propiedades con claridad y control usando Hausdame.</p>
            <div className="cta-actions">
              <Link href="/login" className="btn btn-white btn-lg">Solicitar demo</Link>
              <a href="#pricing" className="btn btn-lg" style={{ background: 'rgba(255,255,255,.1)', color: '#fff', border: '1.5px solid rgba(255,255,255,.25)' }}>Ver precios</a>
            </div>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,.5)' }}>1 propiedad gratis · Sin tarjeta de crédito · Configuración en minutos</p>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
         FOOTER
      ═══════════════════════════════════════════════════════════════ */}
      <footer>
        <div className="container">
          <div className="footer-inner">
            <div className="footer-brand">
              <div className="footer-logo">
                <Image src="/hausdame_Fondo_Blanco.png" alt="Hausdame" width={180} height={60} className="object-contain" style={{ display: 'block' }} />
              </div>
              <p className="footer-desc">La plataforma de operaciones para hosts y gestores de alquileres de corta estancia.</p>
            </div>
            <div className="footer-col">
              <h4>Producto</h4>
              <ul>
                <li><a href="#features">Funciones</a></li>
                <li><a href="#pricing">Precios</a></li>
                <li><a href="#integrations">Integraciones</a></li>
                <li><a href="#">Documentación</a></li>
              </ul>
            </div>
            <div className="footer-col">
              <h4>Empresa</h4>
              <ul>
                <li><a href="#faq">FAQ</a></li>
                <li><a href="#">Privacidad</a></li>
                <li><a href="#">Términos</a></li>
                <li><a href="#">Contacto</a></li>
              </ul>
            </div>
            <div className="footer-col">
              <h4>Cuenta</h4>
              <ul>
                <li><Link href="/login">Iniciar sesión</Link></li>
                <li><Link href="/login">Solicitar demo</Link></li>
                <li><a href="#pricing">Empezar gratis</a></li>
              </ul>
            </div>
          </div>
          <div className="footer-bottom">
            <span className="footer-copy">© 2025 Hausdame. Todos los derechos reservados.</span>
            <span style={{ fontSize: '13px' }}>Hecho para hosts que quieren operar con control.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
