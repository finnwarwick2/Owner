import { claimUnlimitedPassFromUrl } from './games/next-stop/daily';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

claimUnlimitedPassFromUrl();
// If the pass link is opened in a tab that's already on the site, apply it straight away.
window.addEventListener('hashchange', () => {
  if (window.location.hash.startsWith('#unlimited-pass-')) {
    claimUnlimitedPassFromUrl();
    window.location.reload();
  }
});

createRoot(document.getElementById('root')!).render(<App />);
