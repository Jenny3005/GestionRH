// NoteDeService.jsx
import React from 'react';
import './NoteDeService.css';

function NoteDeService({ note, onBack, isLoading }) {
    if (isLoading) {
        return (
            <div className="ns-page-container">
                <div className="ns-card loading-card">
                    <div className="loader-large"></div>
                    <p>Chargement de la note...</p>
                </div>
            </div>
        );
    }

    if (!note) {
        return (
            <div className="ns-page-container">
                <div className="ns-card error-card">
                    <p>❌ Note non trouvée</p>
                    <button onClick={onBack}>← Retour</button>
                </div>
            </div>
        );
    }

    return (
        <div className="ns-page-container">
            <div className="ns-card">
                {/* En-tête basé sur les données de la BDD */}
                <div className="ns-header">
                    <h2>📌 RÉPUBLIQUE DE [PAYS]</h2>
                    <h3>MINISTÈRE / STRUCTURE</h3>
                    <p className="ns-ref">
                        <strong>NOTE DE SERVICE</strong>
                    </p>
                    <p><strong>OBJET :</strong> {note.titre}</p>
                    <p><strong>DATE DE PUBLICATION :</strong> {note.date_publication}</p>
                    <p><strong>STATUT :</strong> {note.statut}</p>
                    {note.tag && <p><strong>TAG :</strong> {note.tag}</p>}
                </div>

                {/* Contenu brut venant de la BDD (affiché tel quel) */}
                <div className="ns-content">
                    <div dangerouslySetInnerHTML={{ __html: note.contenu }} />
                </div>

                {/* Pied de page si besoin */}
                {note.created_by && (
                    <div className="ns-footer">
                        <p>Publié par : {note.created_by} le {new Date(note.created_at).toLocaleDateString()}</p>
                    </div>
                )}

                <div className="ns-back">
                    <button onClick={onBack}>← Retour à la liste</button>
                </div>
            </div>
        </div>
    );
}

export default NoteDeService;