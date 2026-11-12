import { Navigate, Route, Routes } from 'react-router';
import { CreatePlayerPage } from './pages/CreatePlayerPage.jsx';
import { LobbyPage } from './pages/LobbyPage.jsx';
import { NotFoundPage } from './pages/NotFoundPage.jsx';
import { TablePage } from './pages/TablePage.jsx';
import { WaitingRoomPage } from './pages/WaitingRoomPage.jsx';
import { getPlayerId } from './player.js';

/** Pages that need a player send you to "Create your player" first. */
function RequirePlayer({ children }) {
  return getPlayerId() ? children : <Navigate to="/" replace />;
}

// Screens are added here as they are built: profile, waiting room, table, leaderboard.
export function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={getPlayerId() ? <Navigate to="/lobby" replace /> : <CreatePlayerPage />}
      />
      <Route
        path="/lobby"
        element={
          <RequirePlayer>
            <LobbyPage />
          </RequirePlayer>
        }
      />
      <Route
        path="/tables/:code"
        element={
          <RequirePlayer>
            <WaitingRoomPage />
          </RequirePlayer>
        }
      />
      <Route
        path="/tables/:code/play"
        element={
          <RequirePlayer>
            <TablePage />
          </RequirePlayer>
        }
      />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
