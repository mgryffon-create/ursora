import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { prepareBrokerageBootstrap, startBrokerageDailyRefresh } from '@/lib/brokerage-bootstrap';

const root = createRoot(document.getElementById('root')!);

void prepareBrokerageBootstrap().finally(() => {
  root.render(<App />);
  startBrokerageDailyRefresh();
});
