import React, { useRef, useState } from 'react';
import { Settings } from '../types';
import {
  AppDatabaseSnapshot,
  createBackupData,
  validateBackupJson,
} from '../db/storage';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  HardDrive,
  RotateCcw,
  Settings as SettingsIcon,
  Smartphone,
  Trash2,
  Upload,
} from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';

interface SettingsViewProps {
  settings: Settings;
  snapshot: AppDatabaseSnapshot;
  onUpdateSettings: (updated: Settings) => void;
  onImportSnapshot: (imported: AppDatabaseSnapshot) => void;
  onClearHistoryOnly: () => void;
  onResetAllData: () => void;
  canInstallPwa: boolean;
  onInstallPwa: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  snapshot,
  onUpdateSettings,
  onImportSnapshot,
  onClearHistoryOnly,
  onResetAllData,
  canInstallPwa,
  onInstallPwa,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const [pendingImportData, setPendingImportData] =
    useState<AppDatabaseSnapshot | null>(null);
  const [confirmClearHistoryOpen, setConfirmClearHistoryOpen] = useState(false);
  const [confirmFactoryResetOpen, setConfirmFactoryResetOpen] = useState(false);

  const showFeedback = (type: 'success' | 'error', text: string) => {
    setFeedbackMsg({ type, text });
    setTimeout(() => setFeedbackMsg(null), 5000);
  };

  // Exportar JSON
  const handleExportBackup = () => {
    const backup = createBackupData(snapshot);
    const jsonString = JSON.stringify(backup, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const dateStr = new Date().toISOString().split('T')[0];
    const a = document.createElement('a');
    a.href = url;
    a.download = `respaldo-mi-rutina-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showFeedback(
      'success',
      'Copia de seguridad descargada correctamente en tu dispositivo.'
    );
  };

  // Seleccionar archivo JSON para importar
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const validation = validateBackupJson(text);
      if (!validation.valid || !validation.data) {
        showFeedback(
          'error',
          validation.error || 'Archivo de respaldo inválido.'
        );
      } else {
        setPendingImportData(validation.data);
      }
    } catch {
      showFeedback('error', 'No se pudo leer el archivo seleccionado.');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="view-container">
      <header className="page-section-header">
        <h1>
          <SettingsIcon size={24} aria-hidden="true" /> Configuración y Respaldo
        </h1>
        <p>
          Ajusta el cálculo de cargas sugeridas y gestiona las copias de
          seguridad de tus datos.
        </p>
      </header>

      {feedbackMsg && (
        <div
          className={`toast-inline ${feedbackMsg.type}`}
          role="status"
          aria-live="polite"
        >
          {feedbackMsg.type === 'success' ? (
            <CheckCircle2 size={18} aria-hidden="true" />
          ) : (
            <AlertTriangle size={18} aria-hidden="true" />
          )}
          <span>{feedbackMsg.text}</span>
        </div>
      )}

      {/* Explicación clara de almacenamiento local */}
      <section
        className="section-block card-panel info-storage-panel"
        aria-labelledby="storage-info-heading"
      >
        <div className="panel-header-row">
          <h2 id="storage-info-heading">
            <HardDrive size={20} aria-hidden="true" /> ¿Dónde se guardan tus
            datos?
          </h2>
        </div>
        <p className="storage-explanation-text">
          Toda tu información (rutinas, cargas RM e historial de series) se
          guarda <strong>directamente en este dispositivo</strong> usando la
          base de datos local del navegador (IndexedDB), sin cuentas ni
          servidores externos.
        </p>
        <p className="storage-explanation-warning">
          <strong>Importante:</strong> Si borras los datos o el historial del
          navegador, o si cambias de teléfono, tus registros podrían eliminarse
          si no tienes una copia de seguridad. Te recomendamos descargar una
          copia de seguridad periódicamente aquí abajo.
        </p>

        <div className="backup-actions-grid">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleExportBackup}
          >
            <Download size={18} aria-hidden="true" /> Exportar copia de
            seguridad (.json)
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={18} aria-hidden="true" /> Importar copia de seguridad
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileChange}
            style={{ display: 'none' }}
            aria-label="Seleccionar archivo JSON de respaldo"
          />
        </div>
      </section>

      {/* Parámetros de Cálculo de Cargas y Preferencias */}
      <section
        className="section-block card-panel"
        aria-labelledby="calc-settings-heading"
      >
        <h2 id="calc-settings-heading">
          Parámetros de cálculo de cargas (en {settings.units})
        </h2>
        <p className="section-helper">
          Estos valores se usan como punto de partida para sugerir pesos a
          partir de tu RM estimado. Siempre se redondean hacia abajo al salto de
          la máquina.
        </p>

        <div className="settings-form-grid">
          <div className="form-field">
            <label htmlFor="set-warmup-pct">
              Porcentaje de Calentamiento (% de la carga efectiva)
            </label>
            <div className="range-with-value">
              <input
                id="set-warmup-pct"
                type="range"
                min="35"
                max="65"
                step="5"
                value={settings.warmupPercentage}
                onChange={(e) =>
                  onUpdateSettings({
                    ...settings,
                    warmupPercentage: Number(e.target.value),
                  })
                }
              />
              <span className="range-badge">{settings.warmupPercentage} %</span>
            </div>
            <small className="field-hint">
              Recomendado: 45 % a 55 % (carga ligera sin fatigar).
            </small>
          </div>

          <div className="form-field">
            <label htmlFor="set-approach-pct">
              Porcentaje de Aproximación (% de la carga efectiva)
            </label>
            <div className="range-with-value">
              <input
                id="set-approach-pct"
                type="range"
                min="60"
                max="85"
                step="5"
                value={settings.approachPercentage}
                onChange={(e) =>
                  onUpdateSettings({
                    ...settings,
                    approachPercentage: Number(e.target.value),
                  })
                }
              />
              <span className="range-badge">
                {settings.approachPercentage} %
              </span>
            </div>
            <small className="field-hint">
              Recomendado: 70 % a 80 % (prepara para el peso efectivo).
            </small>
          </div>

          <div className="form-field">
            <label htmlFor="set-default-rir">
              RIR objetivo por defecto en series efectivas
            </label>
            <select
              id="set-default-rir"
              value={settings.defaultRIR}
              onChange={(e) =>
                onUpdateSettings({
                  ...settings,
                  defaultRIR: Number(e.target.value),
                })
              }
            >
              <option value={1}>RIR 1 (dejar 1 repetición en reserva)</option>
              <option value={2}>
                RIR 2 (dejar 2 repeticiones en reserva — Recomendado)
              </option>
              <option value={3}>
                RIR 3 (dejar 3 repeticiones en reserva — Muy controlado)
              </option>
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="set-rep-strategy">
              Cálculo de repeticiones dentro del rango objetivo
            </label>
            <select
              id="set-rep-strategy"
              value={settings.targetRepStrategy}
              onChange={(e) =>
                onUpdateSettings({
                  ...settings,
                  targetRepStrategy: e.target.value as
                    | 'midpoint'
                    | 'min'
                    | 'max',
                })
              }
            >
              <option value="midpoint">
                Punto medio del rango (por defecto, ej. 10 en 8–12)
              </option>
              <option value="min">
                Extremo inferior del rango (ej. 8 en 8–12)
              </option>
              <option value="max">
                Extremo superior del rango (ej. 12 en 8–12)
              </option>
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="set-formula">Fórmula de estimación de 1RM</label>
            <select
              id="set-formula"
              value={settings.estimationFormula}
              onChange={(e) =>
                onUpdateSettings({
                  ...settings,
                  estimationFormula: e.target.value as 'epley' | 'brzycki',
                })
              }
            >
              <option value="epley">
                Fórmula de Epley: 1RM = peso × (1 + (reps + RIR) / 30)
              </option>
              <option value="brzycki">Fórmula de Brzycki</option>
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="set-default-inc">
              Incremento mínimo de carga por defecto (kg)
            </label>
            <select
              id="set-default-inc"
              value={settings.defaultIncrement}
              onChange={(e) =>
                onUpdateSettings({
                  ...settings,
                  defaultIncrement: Number(e.target.value),
                })
              }
            >
              <option value={1}>1 kg</option>
              <option value={1.25}>1,25 kg</option>
              <option value={2}>2 kg</option>
              <option value={2.5}>2,5 kg</option>
              <option value={5}>5 kg</option>
            </select>
          </div>

          <div className="form-field">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={settings.largeText}
                onChange={(e) =>
                  onUpdateSettings({
                    ...settings,
                    largeText: e.target.checked,
                  })
                }
              />
              Texto extra grande para lectura más fácil en el gimnasio
            </label>
          </div>
        </div>
      </section>

      {/* Instalar como App en el celular */}
      <section
        className="section-block card-panel"
        aria-labelledby="pwa-install-heading"
      >
        <h2 id="pwa-install-heading">
          <Smartphone size={20} aria-hidden="true" /> Usar como App instalada en
          tu celular
        </h2>
        <p className="section-helper">
          Puedes instalar esta aplicación en la pantalla de inicio de tu
          teléfono para abrirla con un toque y usarla incluso sin conexión a
          internet.
        </p>
        {canInstallPwa && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={onInstallPwa}
            style={{ marginBottom: '0.75rem' }}
          >
            <Download size={18} aria-hidden="true" /> Instalar aplicación ahora
          </button>
        )}
        <ul className="install-instructions-list">
          <li>
            <strong>En Android (Chrome):</strong> Toca el menú de tres puntos
            arriba a la derecha y selecciona{' '}
            <em>“Instalar aplicación”</em> o{' '}
            <em>“Agregar a la pantalla principal”</em>.
          </li>
          <li>
            <strong>En iPhone (Safari):</strong> Toca el botón{' '}
            <em>Compartir</em> en la barra inferior y elige{' '}
            <em>“Agregar a inicio”</em>.
          </li>
        </ul>
      </section>

      {/* Zona de Borrado / Reinicio con Confirmación Explícita */}
      <section
        className="section-block card-panel danger-zone-panel"
        aria-labelledby="danger-zone-heading"
      >
        <h2 id="danger-zone-heading">
          <Trash2 size={20} aria-hidden="true" /> Borrar historial o reiniciar
          datos
        </h2>
        <p className="section-helper">
          Estas acciones requieren tu confirmación antes de aplicarse.
        </p>

        <div className="danger-actions-row">
          <button
            type="button"
            className="btn btn-warning"
            onClick={() => setConfirmClearHistoryOpen(true)}
          >
            <Trash2 size={16} aria-hidden="true" /> Borrar solo el historial de
            sesiones
          </button>

          <button
            type="button"
            className="btn btn-danger"
            onClick={() => setConfirmFactoryResetOpen(true)}
          >
            <RotateCcw size={16} aria-hidden="true" /> Reiniciar toda la app de
            fábrica
          </button>
        </div>
      </section>

      {/* Diálogo: Confirmar sobrescritura al importar copia de seguridad */}
      <ConfirmDialog
        open={Boolean(pendingImportData)}
        title="¿Restaurar copia de seguridad?"
        description={
          pendingImportData
            ? `El archivo seleccionado es válido y contiene ${pendingImportData.sessions.length} sesiones y ${pendingImportData.setLogs.length} series registradas. Al importarlo se reemplazarán los datos actuales del dispositivo. ¿Deseas continuar?`
            : ''
        }
        confirmLabel="Sí, importar y sobrescribir"
        cancelLabel="Cancelar"
        variant="warning"
        onConfirm={() => {
          if (pendingImportData) {
            onImportSnapshot(pendingImportData);
            setPendingImportData(null);
            showFeedback(
              'success',
              'Copia de seguridad restaurada con éxito.'
            );
          }
        }}
        onCancel={() => setPendingImportData(null)}
      />

      {/* Diálogo: Confirmar borrar historial de sesiones */}
      <ConfirmDialog
        open={confirmClearHistoryOpen}
        title="¿Borrar todo el historial de sesiones?"
        description="Se eliminarán todas las sesiones y series registradas hasta ahora, pero se conservarán tus ejercicios y tus cargas RM configuradas. ¿Estás segura?"
        confirmLabel="Sí, borrar historial"
        cancelLabel="Cancelar"
        variant="danger"
        onConfirm={() => {
          onClearHistoryOnly();
          setConfirmClearHistoryOpen(false);
          showFeedback(
            'success',
            'El historial de sesiones ha sido borrado.'
          );
        }}
        onCancel={() => setConfirmClearHistoryOpen(false)}
      />

      {/* Diálogo: Confirmar reinicio de fábrica */}
      <ConfirmDialog
        open={confirmFactoryResetOpen}
        title="¿Reiniciar todos los datos de la aplicación?"
        description="Se borrarán todas las sesiones, series, cargas RM y ediciones de ejercicios, volviendo al estado original de fábrica. ¿Confirmas el reinicio completo?"
        confirmLabel="Sí, reiniciar todo"
        cancelLabel="Cancelar"
        variant="danger"
        onConfirm={() => {
          onResetAllData();
          setConfirmFactoryResetOpen(false);
          showFeedback(
            'success',
            'La aplicación se ha reiniciado a sus valores originales.'
          );
        }}
        onCancel={() => setConfirmFactoryResetOpen(false)}
      />
    </div>
  );
};
