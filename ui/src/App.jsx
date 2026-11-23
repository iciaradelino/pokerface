import { Navigate, Route, Routes } from 'react-router';
import { GestureTutorial } from '../gestures/GestureTutorial.jsx';
import { CreatePlayerPage } from './pages/CreatePlayerPage.jsx';
import { LobbyPage } from './pages/LobbyPage.jsx';
import { NotFoundPage } from './pages/NotFoundPage.jsx';
import { ProfilePage } from './pages/ProfilePage.jsx';
import { TablePage } from './pages/TablePage.jsx';
import { WaitingRoomPage } from './pages/WaitingRoomPage.jsx';
import { getPlayerId } from './player.js';

/** Pages that need a player send you to "Create your player" first. */
function RequirePlayer({ children }) {
  return getPlayerId() ? children : <Navigate to="/" replace />;
}

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
