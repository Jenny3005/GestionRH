import { useEffect } from 'react';
import axios from 'axios';

function App() {
  useEffect(() => {
    axios.get('http://localhost:8000/')
      .then(() => console.log('✅ Connexion OK avec Django'))
      .catch(() => console.log('❌ Connexion échouée avec Django'));
  }, []);

  return (
    <div>
      <h1>Test connexion React ↔ Django</h1>
      <p>Regarde la console (F12)</p>
    </div>
  );
}

export default App;