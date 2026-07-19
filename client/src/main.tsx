import { createRoot } from 'react-dom/client';
import App from './App';
import './pages/emmiwood/emmiwood.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');
createRoot(root).render(<App />);
