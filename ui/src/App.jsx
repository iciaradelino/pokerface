import { Navigate, Route, Routes, useParams } from 'react-router';
import { GestureTutorial } from '../gestures/GestureTutorial.jsx';
import { CreatePlayerPage } from './pages/CreatePlayerPage.jsx';
import { LobbyPage } from './pages/LobbyPage.jsx';
import { NotFoundPage } from './pages/NotFoundPage.jsx';
import { ProfilePage } from './pages/ProfilePage.jsx';
import { TablePage } from './pages/TablePage.jsx';
import { WaitingRoomPage } from './pages/WaitingRoomPage.jsx';
import { getPlayerId } from './player.js';
import { normalizeCode } from './tableCode.js';

/** Pages that need a player send you to "Create your player" first. */
function RequirePlayer({ children }) {
  const { code } = useParams();
  return getPlayerId() ? (
    children
  ) : (
    <Navigate to="/" replace state={{ tableCode: normalizeCode(code) }} />
  );
}

export function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={getPlayerId() ? <Navigate to="/menu" replace /> : <CreatePlayerPage />}
      />
      <Route
        path="/menu"
        element={
          <RequirePlayer>
            <LobbyPage />
          </RequirePlayer>
        }
      />
      <Route path="/lobby" element={<Navigate to="/menu" replace />} />
      <Route
        path="/profile"
        element={
          <RequirePlayer>
            <ProfilePage />
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
      <Route
        path="/tutorial"
        element={
          <RequirePlayer>
            <GestureTutorial />
          </RequirePlayer>
        }
      />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
