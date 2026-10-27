import React, { useEffect, useId, useRef, useState } from 'react';
import { Exercise } from '../types';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Edit3,
  ExternalLink,
  PlayCircle,
  Search,
  ShieldCheck,
  Save,
} from 'lucide-react';

interface ExerciseDetailModalProps {
  open: boolean;
  exercise: Exercise;
  onSaveExercise: (updated: Exercise) => void;
  onClose: () => void;
}

export function extractYouTubeVideoId(url: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.trim());
    if (parsed.hostname.includes('youtu.be')) {
      const id = parsed.pathname.slice(1).split('/')[0];
      return id && id.length === 11 ? id : null;
    }
    if (parsed.hostname.includes('youtube.com')) {
      const vParam = parsed.searchParams.get('v');
      if (vParam && vParam.length === 11) return vParam;
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (
        (parts[0] === 'embed' || parts[0] === 'shorts') &&
        parts[1] &&
        parts[1].length === 11
      ) {
        return parts[1];
      }
    }
  } catch {
    return null;
  }
  return null;
}

export const ExerciseDetailModal: React.FC<ExerciseDetailModalProps> = ({
  open,
  exercise,
  onSaveExercise,
  onClose,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(exercise.name);
  const [muscleInput, setMuscleInput] = useState(exercise.muscleGroup);
  const [videoUrlInput, setVideoUrlInput] = useState(exercise.videoUrl);
  const [instructionsText, setInstructionsText] = useState(
    exercise.instructions.join('\n')
  );
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    setNameInput(exercise.name);
    setMuscleInput(exercise.muscleGroup);
    setVideoUrlInput(exercise.videoUrl);
    setInstructionsText(exercise.instructions.join('\n'));
    setEditing(false);
    setSavedNotice(false);
  }, [exercise, open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => onClose();
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [onClose]);

  const ytVideoId = extractYouTubeVideoId(exercise.videoUrl);
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(
    exercise.youtubeSearchQuery || `${exercise.name} tecnica correcta español`
  )}`;

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedInstructions = instructionsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    onSaveExercise({
      ...exercise,
      name: nameInput.trim() || exercise.name,
      muscleGroup: muscleInput.trim() || exercise.muscleGroup,
      videoUrl: videoUrlInput.trim() || searchUrl,
      instructions:
        cleanedInstructions.length > 0
          ? cleanedInstructions
          : exercise.instructions,
    });
    setEditing(false);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="native-modal-dialog modal-large"
    >
      <div className="modal-dialog-inner">
        <div className="modal-header-row">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onClose}
          >
            <ArrowLeft size={18} aria-hidden="true" /> Volver a la sesión
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setEditing((v) => !v)}
          >
            <Edit3 size={16} aria-hidden="true" />{' '}
            {editing ? 'Cancelar edición' : 'Editar ejercicio'}
          </button>
        </div>

        <div className="exercise-detail-header">
          <h2 id={titleId} className="modal-title">
            {exercise.name}
          </h2>
          <p className="muscle-subtitle">
            <strong>Músculos principales:</strong> {exercise.muscleGroup}
          </p>
        </div>

        {savedNotice && (
          <div className="toast-inline success" role="status">
            <CheckCircle2 size={16} aria-hidden="true" /> Datos del ejercicio
            actualizados correctamente.
          </div>
        )}

        {editing ? (
          <form onSubmit={handleSaveEdit} className="edit-exercise-form">
            <div className="form-field">
              <label htmlFor="edit-ex-name">Nombre del ejercicio</label>
              <input
                id="edit-ex-name"
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="edit-ex-muscle">Músculos principales</label>
              <input
                id="edit-ex-muscle"
                type="text"
                value={muscleInput}
                onChange={(e) => setMuscleInput(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label htmlFor="edit-ex-video">
                URL del video de YouTube (puedes pegar un enlace directo de
                YouTube)
              </label>
              <input
                id="edit-ex-video"
                type="url"
                placeholder="https://www.youtube.com/watch?v=..."
                value={videoUrlInput}
                onChange={(e) => setVideoUrlInput(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label htmlFor="edit-ex-inst">
                Instrucciones de técnica (una por línea)
              </label>
              <textarea
                id="edit-ex-inst"
                rows={5}
                value={instructionsText}
                onChange={(e) => setInstructionsText(e.target.value)}
              />
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setEditing(false)}
              >
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary">
                <Save size={16} aria-hidden="true" /> Guardar cambios
              </button>
            </div>
          </form>
        ) : (
          <>
            {/* Sección de Video Demostrativo */}
            <div className="video-section-card">
              <div className="video-section-header">
                <PlayCircle size={20} aria-hidden="true" />
                <h3>Video demostrativo en español</h3>
              </div>

              {ytVideoId ? (
                <div className="video-embed-wrapper">
                  <iframe
                    title={`Video demostrativo de ${exercise.name}`}
                    src={`https://www.youtube-nocookie.com/embed/${ytVideoId}?rel=0`}
                    loading="lazy"
                    allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              ) : (
                <p className="video-helper-text">
                  Abre la búsqueda directa en YouTube con el nombre exacto del
                  ejercicio o pega el enlace de tu video favorito en{' '}
                  <strong>“Editar ejercicio”</strong> para verlo aquí mismo.
                </p>
              )}

              <div className="video-links-row">
                {ytVideoId && (
                  <a
                    href={exercise.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary btn-sm"
                  >
                    <ExternalLink size={16} aria-hidden="true" /> Abrir video en
                    YouTube
                  </a>
                )}
                <a
                  href={searchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`btn ${
                    ytVideoId ? 'btn-secondary' : 'btn-primary'
                  } btn-sm`}
                >
                  <Search size={16} aria-hidden="true" /> Buscar “
                  {exercise.name}” en YouTube
                </a>
              </div>
            </div>

            {/* Instrucciones paso a paso */}
            <div className="detail-card">
              <h3>
                <CheckCircle2 size={18} aria-hidden="true" /> Cómo hacerlo paso
                a paso
              </h3>
              <ol className="detail-ordered-list">
                {exercise.instructions.map((step, idx) => (
                  <li key={idx}>{step}</li>
                ))}
              </ol>
            </div>

            {/* Errores comunes */}
            <div className="detail-card warning-subtle">
              <h3>
                <AlertTriangle size={18} aria-hidden="true" /> Errores comunes a
                evitar
              </h3>
              <ul className="detail-unordered-list">
                {exercise.commonMistakes.map((mistake, idx) => (
                  <li key={idx}>{mistake}</li>
                ))}
              </ul>
            </div>

            {/* Consejos de seguridad */}
            <div className="detail-card safety-subtle">
              <h3>
                <ShieldCheck size={18} aria-hidden="true" /> Consejos de
                seguridad
              </h3>
              <ul className="detail-unordered-list">
                {exercise.safetyTips.map((tip, idx) => (
                  <li key={idx}>{tip}</li>
                ))}
              </ul>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-primary btn-block"
                onClick={onClose}
              >
                <ArrowLeft size={18} aria-hidden="true" /> Volver a la sesión
              </button>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
};
