import React, { useEffect, useState } from 'react';
import {
  Exercise,
  SetLog,
  Settings,
  UndoAction,
  WorkoutSession,
  WorkoutTemplate,
} from './types';
import {
  DEFAULT_SETTINGS,
  INITIAL_EXERCISES,
  INITIAL_TEMPLATES,
} from './data/initialData';
import {
  AppDatabaseSnapshot,
  loadInitialDatabase,
  writeFullSnapshotToDB,
} from './db/storage';
import {
  calculateExerciseLoads,
  getDateForDayOfWeekInCurrentWeek,
  getDayOfWeek1To7,
  getMondayOfCurrentWeekISO,
} from './utils/calculations';
import { HomeView } from './views/HomeView';
import { WorkoutSessionView } from './views/WorkoutSessionView';
import { ProgressView } from './views/ProgressView';
import { SettingsView } from './views/SettingsView';
import {
  Calendar,
  Dumbbell,
  Settings as SettingsIcon,
  TrendingUp,
  Undo2,
} from 'lucide-react';

type NavTab = 'home' | 'routine' | 'progress' | 'settings';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const App: React.FC = () => {
  const [loaded, setLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<NavTab>('home');

  const [exercises, setExercises] = useState<Exercise[]>(INITIAL_EXERCISES);
  const [templates, setTemplates] =
    useState<WorkoutTemplate[]>(INITIAL_TEMPLATES);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [setLogs, setSetLogs] = useState<SetLog[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  // Día / Plantilla seleccionada en la vista de Rutina
  const todayDayNum = getDayOfWeek1To7(new Date());
  const defaultTemplate =
    INITIAL_TEMPLATES.find((t) => t.dayOfWeek === todayDayNum && !t.isRestDay) ||
    INITIAL_TEMPLATES[0];

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    defaultTemplate.id
  );
  const [selectedDateISO, setSelectedDateISO] = useState<string>(
    getDateForDayOfWeekInCurrentWeek(defaultTemplate.dayOfWeek)
  );
  const [explicitSessionId, setExplicitSessionId] = useState<string | null>(
    null
  );

  // Pila de deshacer acciones recientes y notificación flotante
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);
  const [toastUndo, setToastUndo] = useState<UndoAction | null>(null);

  // Instalación PWA
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallPwa = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };

  // Cargar datos iniciales desde IndexedDB
  useEffect(() => {
    let mounted = true;
    loadInitialDatabase().then((snap) => {
      if (!mounted) return;
      setExercises(snap.exercises);
      setTemplates(snap.templates);
      setSessions(snap.sessions);
      setSetLogs(snap.setLogs);
      setSettings(snap.settings);
      setLoaded(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Guardar cada cambio en IndexedDB
  useEffect(() => {
    if (!loaded) return;
    const snapshot: AppDatabaseSnapshot = {
      exercises,
      templates,
      sessions,
      setLogs,
      settings,
    };
    writeFullSnapshotToDB(snapshot);
  }, [loaded, exercises, templates, sessions, setLogs, settings]);

  const selectedTemplate =
    templates.find((t) => t.id === selectedTemplateId) || templates[0];

  const currentWeekMonday = getMondayOfCurrentWeekISO(new Date());

  // Encontrar la sesión activa para el día seleccionado
  const activeSession: WorkoutSession | null = React.useMemo(() => {
    if (explicitSessionId) {
      const found = sessions.find((s) => s.id === explicitSessionId);
      if (found) return found;
    }
    const matching = sessions.filter(
      (s) =>
        s.templateId === selectedTemplate.id &&
        s.weekStartDate === currentWeekMonday
    );
    if (matching.length === 0) return null;
    return matching.sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  }, [explicitSessionId, sessions, selectedTemplate.id, currentWeekMonday]);

  const activeSessionLogs = React.useMemo(() => {
    if (!activeSession) return [];
    return setLogs.filter((l) => l.sessionId === activeSession.id);
  }, [activeSession, setLogs]);

  // Abrir un día desde el calendario semanal
  const handleOpenDayRoutine = (
    template: WorkoutTemplate,
    targetDateISO: string
  ) => {
    setExplicitSessionId(null);
    setSelectedTemplateId(template.id);
    setSelectedDateISO(targetDateISO);
    setActiveTab('routine');
  };

  // Cambiar de pestaña de día dentro de la vista Rutina
  const handleSelectTemplateDay = (template: WorkoutTemplate) => {
    setExplicitSessionId(null);
    setSelectedTemplateId(template.id);
    setSelectedDateISO(getDateForDayOfWeekInCurrentWeek(template.dayOfWeek));
  };

  // Abrir una sesión pasada desde el Historial
  const handleOpenPastSession = (sess: WorkoutSession) => {
    setExplicitSessionId(sess.id);
    setSelectedTemplateId(sess.templateId);
    setSelectedDateISO(sess.date);
    setActiveTab('routine');
  };

  // Crear sesión "en curso" solo cuando la usuaria registra o interactúa (no solo por abrir)
  const handleEnsureSessionStarted = (): WorkoutSession => {
    if (activeSession) return activeSession;

    const nowIso = new Date().toISOString();
    const newSession: WorkoutSession = {
      id: `sess_${selectedTemplate.id}_${selectedDateISO}_${Date.now()}`,
      date: selectedDateISO,
      weekStartDate: currentWeekMonday,
      templateId: selectedTemplate.id,
      templateName: selectedTemplate.name,
      dayOfWeek: selectedTemplate.dayOfWeek,
      status: 'in_progress',
      startedAt: nowIso,
      finishedAt: null,
      exerciseStates: {},
    };

    setSessions((prev) => [newSession, ...prev]);
    return newSession;
  };

  // Insertar o actualizar un registro de serie sin crear duplicados
  const handleUpsertSetLog = (log: SetLog, undoDescription?: string) => {
    setSetLogs((prev) => {
      const existingIndex = prev.findIndex((item) => item.id === log.id);
      const previousSetLog: SetLog =
        existingIndex >= 0
          ? prev[existingIndex]
          : {
              ...log,
              status: 'pending',
              completedAt: null,
              missingDetails: false,
            };

      if (undoDescription) {
        const undoEntry: UndoAction = {
          id: `undo_${Date.now()}`,
          description: undoDescription,
          timestamp: Date.now(),
          previousSetLog: structuredClone(previousSetLog),
          previousExerciseState: activeSession?.exerciseStates[log.exerciseId]
            ? structuredClone(activeSession.exerciseStates[log.exerciseId])
            : undefined,
        };
        setUndoStack((uPrev) => [undoEntry, ...uPrev.slice(0, 9)]);
        setToastUndo(undoEntry);
      }

      if (existingIndex >= 0) {
        const copy = [...prev];
        copy[existingIndex] = log;
        return copy;
      }
      return [...prev, log];
    });
  };

  // Deshacer el último registro de serie
  const handleUndoLast = () => {
    if (undoStack.length === 0) return;
    const [latestUndo, ...restUndo] = undoStack;
    const prevLog = latestUndo.previousSetLog;

    setSetLogs((prev) => {
      const idx = prev.findIndex((l) => l.id === prevLog.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = prevLog;
        return copy;
      }
      return [...prev, prevLog];
    });

    if (latestUndo.previousExerciseState) {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === prevLog.sessionId
            ? {
                ...s,
                exerciseStates: {
                  ...s.exerciseStates,
                  [prevLog.exerciseId]: latestUndo.previousExerciseState!,
                },
              }
            : s
        )
      );
    }

    setUndoStack(restUndo);
    setToastUndo(null);
  };

  useEffect(() => {
    if (!toastUndo) return;
    const timer = setTimeout(() => {
      setToastUndo(null);
    }, 6000);
    return () => clearTimeout(timer);
  }, [toastUndo]);

  const handleDeleteSetLog = (logId: string) => {
    setSetLogs((prev) => prev.filter((l) => l.id !== logId));
  };

  const handleUpdateSession = (updated: WorkoutSession) => {
    setSessions((prev) => {
      const idx = prev.findIndex((s) => s.id === updated.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = updated;
        return copy;
      }
      return [updated, ...prev];
    });
  };

  const handleDeleteSession = (sessionId: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    setSetLogs((prev) => prev.filter((l) => l.sessionId !== sessionId));
    if (explicitSessionId === sessionId) {
      setExplicitSessionId(null);
    }
  };

  const handleUpdateExercise = (updated: Exercise) => {
    setExercises((prev) =>
      prev.map((ex) => (ex.id === updated.id ? updated : ex))
    );
    // Sincronizar también la carga sugerida de las series pendientes de este ejercicio
    const tplItem =
      selectedTemplate.exercises.find((e) => e.exerciseId === updated.id) ||
      null;
    const newLoads = calculateExerciseLoads(updated, tplItem, settings);

    setSetLogs((prev) =>
      prev.map((log) => {
        if (log.exerciseId !== updated.id || log.status === 'completed') {
          return log;
        }
        const nextSuggested =
          log.setType === 'warmup'
            ? newLoads.warmupLoad
            : log.setType === 'approach'
            ? log.typeIndex > 1
              ? newLoads.secondApproachLoad ?? newLoads.approachLoad
              : newLoads.approachLoad
            : newLoads.effectiveLoad;

        const shouldUpdateActual =
          log.actualLoad === null || log.actualLoad === log.suggestedLoad;

        return {
          ...log,
          suggestedLoad: nextSuggested,
          actualLoad: shouldUpdateActual ? nextSuggested : log.actualLoad,
        };
      })
    );
  };

  const handleImportSnapshot = (imported: AppDatabaseSnapshot) => {
    setExercises(imported.exercises);
    setTemplates(imported.templates);
    setSessions(imported.sessions);
    setSetLogs(imported.setLogs);
    setSettings(imported.settings);
    setUndoStack([]);
  };

  const handleClearHistoryOnly = () => {
    setSessions([]);
    setSetLogs([]);
    setUndoStack([]);
    setExplicitSessionId(null);
  };

  const handleResetAllData = () => {
    setExercises(structuredClone(INITIAL_EXERCISES));
    setTemplates(structuredClone(INITIAL_TEMPLATES));
    setSessions([]);
    setSetLogs([]);
    setSettings(structuredClone(DEFAULT_SETTINGS));
    setUndoStack([]);
    setExplicitSessionId(null);
  };

  return (
    <div
      className={`app-shell ${settings.largeText ? 'large-text-mode' : ''}`}
    >
      {/* Cabecera superior compacta */}
      <header className="top-app-bar">
        <div className="top-bar-inner">
          <div
            className="brand-lockup"
            onClick={() => setActiveTab('home')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') setActiveTab('home');
            }}
          >
            <span className="brand-icon" aria-hidden="true">
              <Dumbbell size={20} aria-hidden="true" />
            </span>
            <div>
              <span className="brand-title">Mi Rutina Gym</span>
              <span className="brand-subtitle">Upper / Lower • Glúteos</span>
            </div>
          </div>

          {undoStack.length > 0 && (
            <button
              type="button"
              className="btn btn-top-undo"
              onClick={handleUndoLast}
              aria-label="Deshacer último registro"
            >
              <Undo2 size={15} aria-hidden="true" /> Deshacer
            </button>
          )}
        </div>
      </header>

      {/* Contenido principal */}
      <main id="main-content" className="app-main">
        {activeTab === 'home' && (
          <HomeView
            templates={templates}
            exercises={exercises}
            sessions={sessions}
            setLogs={setLogs}
            onOpenDayRoutine={handleOpenDayRoutine}
            canInstallPwa={Boolean(deferredPrompt)}
            onInstallPwa={handleInstallPwa}
          />
        )}

        {activeTab === 'routine' && (
          <WorkoutSessionView
            templates={templates}
            selectedTemplate={selectedTemplate}
            targetDateISO={selectedDateISO}
            exercises={exercises}
            session={activeSession}
            sessionLogs={activeSessionLogs}
            allSessions={sessions}
            allSetLogs={setLogs}
            settings={settings}
            onSelectTemplateDay={handleSelectTemplateDay}
            onEnsureSessionStarted={handleEnsureSessionStarted}
            onUpsertSetLog={handleUpsertSetLog}
            onDeleteSetLog={handleDeleteSetLog}
            onUpdateSession={handleUpdateSession}
            onUpdateExercise={handleUpdateExercise}
            undoStack={undoStack}
            onUndoLast={handleUndoLast}
          />
        )}

        {activeTab === 'progress' && (
          <ProgressView
            exercises={exercises}
            templates={templates}
            sessions={sessions}
            setLogs={setLogs}
            settings={settings}
            onUpdateExercise={handleUpdateExercise}
            onUpsertSetLog={handleUpsertSetLog}
            onDeleteSetLog={handleDeleteSetLog}
            onDeleteSession={handleDeleteSession}
            onOpenPastSession={handleOpenPastSession}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            settings={settings}
            snapshot={{ exercises, templates, sessions, setLogs, settings }}
            onUpdateSettings={setSettings}
            onImportSnapshot={handleImportSnapshot}
            onClearHistoryOnly={handleClearHistoryOnly}
            onResetAllData={handleResetAllData}
            canInstallPwa={Boolean(deferredPrompt)}
            onInstallPwa={handleInstallPwa}
          />
        )}
      </main>

      {/* Toast flotante de confirmación con opción inmediata de Deshacer */}
      {toastUndo && (
        <div className="floating-undo-toast" role="status" aria-live="polite">
          <span>{toastUndo.description}</span>
          <button
            type="button"
            className="btn-toast-undo"
            onClick={handleUndoLast}
          >
            <Undo2 size={15} aria-hidden="true" /> Deshacer
          </button>
        </div>
      )}

      {/* Barra de navegación inferior (Mobile-first) */}
      <nav className="bottom-nav" aria-label="Navegación principal">
        <button
          type="button"
          className={`nav-item ${activeTab === 'home' ? 'active' : ''}`}
          onClick={() => setActiveTab('home')}
          aria-current={activeTab === 'home' ? 'page' : undefined}
        >
          <Calendar size={22} aria-hidden="true" />
          <span>Inicio</span>
        </button>

        <button
          type="button"
          className={`nav-item ${activeTab === 'routine' ? 'active' : ''}`}
          onClick={() => setActiveTab('routine')}
          aria-current={activeTab === 'routine' ? 'page' : undefined}
        >
          <Dumbbell size={22} aria-hidden="true" />
          <span>Rutina</span>
        </button>

        <button
          type="button"
          className={`nav-item ${activeTab === 'progress' ? 'active' : ''}`}
          onClick={() => setActiveTab('progress')}
          aria-current={activeTab === 'progress' ? 'page' : undefined}
        >
          <TrendingUp size={22} aria-hidden="true" />
          <span>Progreso</span>
        </button>

        <button
          type="button"
          className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
          aria-current={activeTab === 'settings' ? 'page' : undefined}
        >
          <SettingsIcon size={22} aria-hidden="true" />
          <span>Configuración</span>
        </button>
      </nav>
    </div>
  );
};

export default App;
