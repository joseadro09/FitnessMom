import {
  BackupData,
  Exercise,
  SetLog,
  Settings,
  WorkoutSession,
  WorkoutTemplate,
} from '../types';
import {
  DEFAULT_SETTINGS,
  INITIAL_EXERCISES,
  INITIAL_TEMPLATES,
} from '../data/initialData';

const DB_NAME = 'fitness_mom_db';
const DB_VERSION = 1;
const LS_SNAPSHOT_KEY = 'fitness_mom_snapshot_v1';

export interface AppDatabaseSnapshot {
  exercises: Exercise[];
  templates: WorkoutTemplate[];
  sessions: WorkoutSession[];
  setLogs: SetLog[];
  settings: Settings;
}

/**
 * Elimina posibles duplicados históricos en setLogs que compartan
 * (sessionId, exerciseId, setNumber), conservando el registro completado
 * o más reciente y normalizando su id.
 */
export function deduplicateSetLogs(logs: SetLog[]): SetLog[] {
  const byKey = new Map<string, SetLog>();
  for (const log of logs) {
    const key = `${log.sessionId}::${log.exerciseId}::${log.setNumber}`;
    const canonicalId = `${log.sessionId}_${log.exerciseId}_${log.setType}_${log.setNumber}`;
    const normalized: SetLog = { ...log, id: canonicalId };
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, normalized);
    } else if (
      normalized.status === 'completed' &&
      existing.status !== 'completed'
    ) {
      byKey.set(key, normalized);
    } else if (
      normalized.status === existing.status &&
      (normalized.completedAt || '') >= (existing.completedAt || '')
    ) {
      byKey.set(key, normalized);
    }
  }
  return Array.from(byKey.values());
}

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB no disponible en este entorno'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('exercises')) {
        db.createObjectStore('exercises', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('templates')) {
        db.createObjectStore('templates', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('sessions')) {
        db.createObjectStore('sessions', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('setLogs')) {
        const store = db.createObjectStore('setLogs', { keyPath: 'id' });
        store.createIndex('sessionId', 'sessionId', { unique: false });
        store.createIndex('exerciseId', 'exerciseId', { unique: false });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getAllFromStore<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

function saveSnapshotToLocalStorage(snapshot: AppDatabaseSnapshot): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LS_SNAPSHOT_KEY, JSON.stringify(snapshot));
    }
  } catch {
    // Ignore quota errors
  }
}

function loadSnapshotFromLocalStorage(): AppDatabaseSnapshot | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(LS_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.exercises) && Array.isArray(parsed.templates)) {
      return parsed as AppDatabaseSnapshot;
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

export async function writeFullSnapshotToDB(
  snapshot: AppDatabaseSnapshot
): Promise<void> {
  saveSnapshotToLocalStorage(snapshot);
  try {
    const db = await openIDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(
        ['exercises', 'templates', 'sessions', 'setLogs', 'settings'],
        'readwrite'
      );

      const exStore = tx.objectStore('exercises');
      exStore.clear();
      for (const ex of snapshot.exercises) {
        exStore.put(ex);
      }

      const tplStore = tx.objectStore('templates');
      tplStore.clear();
      for (const tpl of snapshot.templates) {
        tplStore.put(tpl);
      }

      const sessStore = tx.objectStore('sessions');
      sessStore.clear();
      for (const s of snapshot.sessions) {
        sessStore.put(s);
      }

      const logStore = tx.objectStore('setLogs');
      logStore.clear();
      for (const log of snapshot.setLogs) {
        logStore.put(log);
      }

      const setStore = tx.objectStore('settings');
      setStore.clear();
      setStore.put({ id: 'user_settings', ...snapshot.settings });

      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    // Fallback already saved in localStorage
  }
}

export async function loadInitialDatabase(): Promise<AppDatabaseSnapshot> {
  try {
    const db = await openIDB();
    const [exercises, templates, sessions, setLogs, settingsArr] =
      await Promise.all([
        getAllFromStore<Exercise>(db, 'exercises'),
        getAllFromStore<WorkoutTemplate>(db, 'templates'),
        getAllFromStore<WorkoutSession>(db, 'sessions'),
        getAllFromStore<SetLog>(db, 'setLogs'),
        getAllFromStore<{ id: string } & Settings>(db, 'settings'),
      ]);
    db.close();

    if (exercises.length > 0 && templates.length > 0) {
      const userSettings = settingsArr.find((s) => s.id === 'user_settings');
      const settings: Settings = userSettings
        ? {
            units: 'kg',
            estimationFormula: userSettings.estimationFormula ?? DEFAULT_SETTINGS.estimationFormula,
            warmupPercentage: userSettings.warmupPercentage ?? DEFAULT_SETTINGS.warmupPercentage,
            approachPercentage: userSettings.approachPercentage ?? DEFAULT_SETTINGS.approachPercentage,
            secondApproachPercentage:
              userSettings.secondApproachPercentage ?? DEFAULT_SETTINGS.secondApproachPercentage,
            defaultRIR: userSettings.defaultRIR ?? DEFAULT_SETTINGS.defaultRIR,
            defaultIncrement: userSettings.defaultIncrement ?? DEFAULT_SETTINGS.defaultIncrement,
            targetRepStrategy: userSettings.targetRepStrategy ?? DEFAULT_SETTINGS.targetRepStrategy,
            largeText: userSettings.largeText ?? DEFAULT_SETTINGS.largeText,
          }
        : { ...DEFAULT_SETTINGS };

      // Ensure templates stay ordered by dayOfWeek
      templates.sort((a, b) => a.dayOfWeek - b.dayOfWeek);

      const snapshot: AppDatabaseSnapshot = {
        exercises,
        templates,
        sessions,
        setLogs: deduplicateSetLogs(setLogs),
        settings,
      };
      saveSnapshotToLocalStorage(snapshot);
      return snapshot;
    }
  } catch {
    // Fallback to localStorage if IndexedDB fails
  }

  const fromLS = loadSnapshotFromLocalStorage();
  if (fromLS && fromLS.exercises.length > 0 && fromLS.templates.length > 0) {
    fromLS.setLogs = deduplicateSetLogs(fromLS.setLogs || []);
    await writeFullSnapshotToDB(fromLS);
    return fromLS;
  }

  const initialSnapshot: AppDatabaseSnapshot = {
    exercises: structuredClone(INITIAL_EXERCISES),
    templates: structuredClone(INITIAL_TEMPLATES),
    sessions: [],
    setLogs: [],
    settings: structuredClone(DEFAULT_SETTINGS),
  };

  await writeFullSnapshotToDB(initialSnapshot);
  return initialSnapshot;
}

export function createBackupData(snapshot: AppDatabaseSnapshot): BackupData {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    app: 'fitness-mom-pwa',
    exercises: snapshot.exercises,
    templates: snapshot.templates,
    sessions: snapshot.sessions,
    setLogs: snapshot.setLogs,
    settings: snapshot.settings,
  };
}

export interface BackupValidationResult {
  valid: boolean;
  error?: string;
  data?: AppDatabaseSnapshot;
}

export function validateBackupJson(rawText: string): BackupValidationResult {
  try {
    const parsed = JSON.parse(rawText);
    if (!parsed || typeof parsed !== 'object') {
      return { valid: false, error: 'El archivo no contiene un objeto JSON válido.' };
    }
    if (parsed.app !== 'fitness-mom-pwa') {
      return {
        valid: false,
        error: 'El archivo no corresponde a una copia de seguridad de esta aplicación.',
      };
    }
    if (!Array.isArray(parsed.exercises) || parsed.exercises.length === 0) {
      return { valid: false, error: 'La copia de seguridad no contiene ejercicios válidos.' };
    }
    if (!Array.isArray(parsed.templates) || parsed.templates.length === 0) {
      return { valid: false, error: 'La copia de seguridad no contiene las rutinas semanales.' };
    }
    if (!Array.isArray(parsed.sessions) || !Array.isArray(parsed.setLogs)) {
      return {
        valid: false,
        error: 'El formato de sesiones o registros de series es inválido.',
      };
    }
    if (!parsed.settings || typeof parsed.settings !== 'object') {
      return { valid: false, error: 'La configuración del archivo es inválida.' };
    }

    // Validate basic structure of exercises and sessions
    for (const ex of parsed.exercises) {
      if (!ex.id || !ex.name) {
        return { valid: false, error: 'Uno o más ejercicios en el respaldo no tienen ID o nombre.' };
      }
    }

    return {
      valid: true,
      data: {
        exercises: parsed.exercises,
        templates: parsed.templates,
        sessions: parsed.sessions,
        setLogs: parsed.setLogs,
        settings: {
          ...DEFAULT_SETTINGS,
          ...parsed.settings,
        },
      },
    };
  } catch {
    return {
      valid: false,
      error: 'No se pudo leer el archivo JSON. Asegúrate de seleccionar un archivo .json válido.',
    };
  }
}
