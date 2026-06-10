// services/noteService.js
const API_URL = 'http://localhost:3001/api'; // à remplacer par ton endpoint réel

export async function getAllNotes() {
    const response = await fetch(`${API_URL}/notes`);
    if (!response.ok) throw new Error('Erreur chargement');
    return response.json();
}

export async function getNoteById(id) {
    const response = await fetch(`${API_URL}/notes/${id}`);
    if (!response.ok) throw new Error('Note introuvable');
    return response.json();
}