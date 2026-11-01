import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { SessionProvider } from './system/session/SessionProvider';
import { PendingResultsProvider } from './system/results/PendingResultsProvider';
import { ReplaysProvider } from './system/replays/ReplaysProvider';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('缺少页面挂载点');
createRoot(root).render(<StrictMode><BrowserRouter><SessionProvider><PendingResultsProvider><ReplaysProvider><App /></ReplaysProvider></PendingResultsProvider></SessionProvider></BrowserRouter></StrictMode>);
