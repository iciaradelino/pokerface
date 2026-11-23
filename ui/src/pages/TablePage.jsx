import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { gameApi } from '../api/gameApi.js';
import { ApiError } from '../api/http.js';
import { playersApi } from '../api/playersApi.js';
import { playerColour } from '../components/Avatar.jsx';
import { Button } from '../components/Button.jsx';
import { ChipAmount, DealerButton, formatChips } from '../components/Chips.jsx';
import { Logo } from '../components/Logo.jsx';
import { CardSlot, PlayingCard } from '../components/PlayingCard.jsx';
import { normalizeCode } from '../tableCode.js';
import { ActionBar } from '../table/ActionBar.jsx';
import { STAGE_LABELS, arrangeSeats, potTotal, seatNote } from '../table/tableView.js';
import { useTableSocket } from '../table/useTableSocket.js';
import { isPlayerGone, usePlayer } from '../usePlayer.js';
import { turnFrom } from '../../gestures/detector.js';
import { GestureHold, GesturePanel } from '../../gestures/GesturePanel.jsx';
import { holdMsOf } from '../gestureSettings.js';
import { useGestures } from '../../gestures/useGestures.js';
import { VideoTile } from '../../video/VideoTile.jsx';
import { useVideo } from '../../video/useVideo.js';
import './TablePage.css';

// Where each spot sits, in % of the table area (x, y): `at` is the middle of the camera tile,
// on the rim of the oval so the tiles surround the felt; `bet` is where that seat's chips go,
// on the felt in front of it and clear of the board. Spot 0 is you, at the bottom; the rest go
// clockwise. Fewer seats use fewer, evenly spread spots.
const ME_SPOT = { at: [50, 84], bet: [35, 66] };
const LEFT = { at: [9, 50], bet: [26, 50] };
const RIGHT = { at: [91, 50], bet: [74, 50] };
const SPOTS = {
  2: [ME_SPOT, { at: [50, 14], bet: [50, 31] }],
  3: [ME_SPOT, { at: [28, 14], bet: [37, 31] }, { at: [72, 14], bet: [63, 31] }],
  4: [ME_SPOT, LEFT, { at: [50, 14], bet: [50, 31] }, RIGHT],
  5: [ME_SPOT, LEFT, { at: [30, 14], bet: [39, 31] }, { at: [70, 14], bet: [61, 31] }, RIGHT],
  6: [
    ME_SPOT,
    LEFT,
    { at: [30, 14], bet: [39, 31] },
    { at: [70, 14], bet: [61, 31] },
    RIGHT,
    { at: [80, 84], bet: [69, 66] },
  ],
};

const spotsFor = (maxSeats) => SPOTS[maxSeats] ?? SPOTS[6];

/** The seats from GET /tables/:id in the shape of a "state" message, until the socket sends one. */
function stateFromTable(table) {
  return {
    type: 'state',
    handNumber: 0,
    stage: 'waiting',
    board: [],
    pots: [],
    dealer: null,
    currentPlayer: null,
    timerEndsAt: null,
    seats: table.seats.map((seat) => ({
      seat: seat.seatIndex,
      playerId: seat.playerId,
      name: seat.name,
      stack: seat.stack,
      bet: 0,
      status: 'waiting',
    })),
    result: null,
  };
}

export function TablePage() {
  const code = normalizeCode(useParams().code);
  const navigate = useNavigate();
  const { playerId, player, startOver } = usePlayer();
  const [table, setTable] = useState(null);
  const [problem, setProblem] = useState(null); // notFound | notSeated | unavailable

  useEffect(() => {
    let active = true;
    gameApi
      .getTable(code)
      .then((data) => {
        if (!active) return;
        setTable(data);
        if (!data.seats.some((seat) => seat.playerId === playerId)) setProblem('notSeated');
      })
      .catch((err) => {
        if (!active) return;
        setProblem(err instanceof ApiError && err.status === 404 ? 'notFound' : 'unavailable');
      });
    return () => {
      active = false;
    };
  }, [code, playerId]);

  const {
    state: live,
    mine,
    connection,
    closeCode,
    send,
    onSignal,
  } = useTableSocket(code, playerId);

  // Video and sound between the players seated here (ui/video/). It goes player to player;
  // the game service only relays the signals. Nobody else at the table receives it.
  const seated = (live?.seats ?? table?.seats ?? []).map((seat) => seat.playerId);
  const video = useVideo({ playerId, peerIds: seated, send, onSignal });

  // Gestures (ui/gestures/, Ali). On unless the profile turned them off, or the player switches
  // them off here. They send the same actions as the buttons, which always work too.
  const [gesturesChoice, setGesturesChoice] = useState(null);
  // Whether the action buttons and the gestures guide are unfolded (null: not chosen yet).
  const [buttonsChoice, setButtonsChoice] = useState(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [gestureSend, setGestureSend] = useState({ busy: false, error: null, turnKey: null });
  const myTurn = (mine?.legalActions?.length ?? 0) > 0 && live?.currentPlayer === playerId;
  const turnKey = `${live?.handNumber}-${live?.stage}-${live?.currentPlayer}-${mine?.minRaise}`;
  const gesturesEnabled =
    !problem && (gesturesChoice ?? (player ? player.gestureSettings?.enabled !== false : false));

  async function sendGesture(action, amount) {
    setGestureSend({ busy: true, error: null, turnKey });
    try {
      await gameApi.act(code, playerId, action, amount);
      setGestureSend({ busy: false, error: null, turnKey });
    } catch (err) {
      if (isPlayerGone(err)) return startOver();
      const error = err instanceof ApiError ? err.message : 'Tables unavailable';
      setGestureSend({ busy: false, error, turnKey });
    }
  }

  // One camera for the table: gestures read the video's picture instead of opening a second
  // camera, and wait while the video is still asking for it. Only without a video camera
  // (blocked or missing) do gestures try one of their own.
  const gestures = useGestures({
    enabled: gesturesEnabled,
    stream: video.local,
    cameraPending: video.camera === 'asking',
    turn: gestureSend.busy ? null : turnFrom({ myTurn, mine, bigBlind: table?.bigBlind }),
    onFire: sendGesture,
    holdMs: holdMsOf(player),
  });

  // Not at this table yet (e.g. someone opened the link): the waiting room seats you first.
  if (problem === 'notSeated') return <Navigate to={`/tables/${code}`} replace />;
  if (problem) return <TableProblem code={code} problem={problem} />;
  // The server closed the socket for good: the table is gone, or you are no longer seated.
  if (connection === 'closed') {
    return <TableProblem code={code} problem={closeCode === 4403 ? 'notAtTable' : 'notFound'} />;
  }

  const state = live ?? (table ? stateFromTable(table) : null);
  const maxSeats = table?.maxSeats ?? 6;
  const pot = potTotal(state?.pots);
  const nameOf = (id) => state?.seats.find((seat) => seat.playerId === id)?.name ?? 'Someone';
  const stage = state?.stage ?? 'waiting';
  const handLabel =
    state && state.handNumber > 0
      ? `Hand #${state.handNumber} · ${STAGE_LABELS[stage]}`
      : 'No hand yet';

  const inHand = !['waiting', 'complete'].includes(stage);
  // The buttons start folded away while gestures work, to make gestures the way to play. With
  // gestures off or no camera they start open, since they are the only way to act.
  const buttonsOpen = buttonsChoice ?? !['on', 'starting'].includes(gestures.status);

  return (
    <div className="table-page">
      <header className="table-bar">
        <div className="row table-bar__info">
          <Logo />
          <span className="table-bar__title">Private table</span>
          <CopyCode code={code} />
          {table && (
            <span className="table-bar__pill tabular">
              Blinds {formatChips(table.smallBlind)} / {formatChips(table.bigBlind)}
            </span>
          )}
          <span className="table-bar__pill">{handLabel}</span>
        </div>
        <div className="row table-bar__me">
          {player && (
            <span className="table-bar__pill table-bar__chips tabular">
              <span className="table-bar__chip" aria-hidden="true" />
              <strong>{formatChips(player.chips)}</strong>
              <span className="muted">play chips</span>
            </span>
          )}
          {video.hasMic && (
            <button
              type="button"
              className="table-bar__icon-btn"
              onClick={video.toggleMic}
              aria-pressed={!video.micOn}
              aria-label={video.micOn ? 'Mute' : 'Unmute'}
              title={video.micOn ? 'Mute' : 'Unmute'}
            >
              <MicIcon off={!video.micOn} />
            </button>
          )}
          <Button variant="outline" onClick={() => navigate('/lobby')}>
            Leave table
          </Button>
        </div>
      </header>

      <main className="table-page__main">
        <div className="table-page__play">
          {connection !== 'open' && (
            <div className="banner" role="status">
              {connection === 'connecting'
                ? 'Connecting to the table…'
                : 'Connection lost. Reconnecting…'}
            </div>
          )}

          <section className="felt-wrap" aria-label="Table">
            {/* Tiles are biggest with few players and shrink a little as the table fills */}
            <div className={`felt felt--players-${Math.min(state?.seats.length ?? 0, 6)}`}>
              {/* The green oval; the seats sit around its rim */}
              <div className="felt__table" aria-hidden="true" />
              <span className="felt__brand" aria-hidden="true">
                POKERFACE
              </span>

              <div className="felt__centre">
                {/* The winner goes on top, where no tile covers it */}
                {state?.result && <Result result={state.result} nameOf={nameOf} me={playerId} />}
                {pot > 0 && (
                  <div className="felt__pot">
                    <ChipAmount amount={pot} label="Pot" />
                  </div>
                )}
                <div className="felt__board" aria-label="Board">
                  {Array.from({ length: 5 }, (_, i) =>
                    state?.board[i] ? (
                      // Mounts when dealt, so the deal-in animation plays once per card
                      <PlayingCard key={i} card={state.board[i]} size="md" className="deal-in" />
                    ) : (
                      <CardSlot key={i} size="md" />
                    ),
                  )}
                </div>
                {stage === 'waiting' && (
                  <p className="felt__waiting">
                    {state && state.seats.length < 2
                      ? 'Waiting for at least 2 players'
                      : 'The next hand starts soon'}
                  </p>
                )}
              </div>

              {state &&
                arrangeSeats(state.seats, maxSeats, playerId).map(({ spot, seat }) => (
                  <SeatSpot
                    key={spot}
                    position={spotsFor(maxSeats)[spot].at}
                    seat={seat}
                    code={code}
                    isMe={seat?.playerId === playerId}
                    colour={seat?.playerId === playerId && player ? player.avatar : seat?.playerId}
                    isDealer={seat !== null && seat.playerId === state.dealer}
                    won={winnings(state.result, seat?.playerId)}
                    hasCards={inHand && (seat?.status === 'active' || seat?.status === 'allin')}
                    note={
                      seat
                        ? seatNote(seat, {
                            currentPlayer: state.currentPlayer,
                            myPlayerId: playerId,
                          })
                        : ''
                    }
                    video={video}
                    gestures={seat?.playerId === playerId && video.local ? gestures : null}
                    holeCards={
                      seat?.playerId === playerId
                        ? mine?.holeCards
                        : state.result?.revealed?.[seat?.playerId]
                    }
                  />
                ))}

              {/* Bets get their own layer on top of everything, so nothing ever covers a chip */}
              <div className="felt__bets">
                {state &&
                  arrangeSeats(state.seats, maxSeats, playerId).map(({ spot, seat }) => {
                    if (!seat || seat.bet <= 0) return null;
                    const [x, y] = spotsFor(maxSeats)[spot].bet;
                    return (
                      <span
                        key={spot}
                        className="seat__bet"
                        style={{ left: `${x}%`, top: `${y}%` }}
                      >
                        <ChipAmount amount={seat.bet} />
                      </span>
                    );
                  })}
              </div>
            </div>
          </section>

          <ActionBar
            key={`${state?.handNumber}-${stage}-${state?.currentPlayer}-${mine?.minRaise}`}
            code={code}
            playerId={playerId}
            state={state}
            mine={mine}
            pot={pot}
            bigBlind={table?.bigBlind ?? 1}
            waitingFor={state?.currentPlayer ? nameOf(state.currentPlayer) : null}
            onPlayerGone={startOver}
            open={buttonsOpen}
            onToggle={() => setButtonsChoice(!buttonsOpen)}
          />
        </div>

        <aside className="table-page__side" aria-label="Leaderboard and gestures">
          <TableLeaderboard playerId={playerId} />
          <GesturePanel
            gestures={gestures}
            showPreview={!video.local}
            myTurn={myTurn}
            legal={myTurn ? mine.legalActions : null}
            toCall={mine?.toCall ?? 0}
            onToggle={() => setGesturesChoice(!gesturesEnabled)}
            error={gestureSend.turnKey === turnKey ? gestureSend.error : null}
            guideOpen={guideOpen}
            onGuideToggle={() => setGuideOpen(!guideOpen)}
          />
        </aside>
      </main>
    </div>
  );
}

function SeatSpot({
  position,
  seat,
  code,
  isMe,
  colour,
  isDealer,
  won,
  hasCards,
  note,
  holeCards,
  video,
  gestures,
}) {
  const [x, y] = position;

  if (!seat) {
    return (
      <div className="seat seat--empty" style={{ left: `${x}%`, top: `${y}%` }}>
        <span className="seat__empty-title">Empty seat</span>
        <CopyInvite code={code} />
      </div>
    );
  }

  const classes = [
    'seat',
    isMe && 'seat--me',
    note === 'Your turn' || note === 'Thinking…' ? 'seat--acting' : '',
    seat.status === 'folded' && 'seat--folded',
    isDealer && 'seat--dealer',
    won > 0 && 'seat--winner',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <div
        className={classes}
        style={{ left: `${x}%`, top: `${y}%`, '--seat-colour': playerColour(colour) }}
        aria-label={`${isMe ? 'You' : seat.name}, ${formatChips(seat.stack)} chips${note ? `, ${note}` : ''}`}
      >
        {holeCards?.length > 0 && (
          <div className={isMe ? 'seat__cards seat__cards--mine' : 'seat__cards'}>
            {holeCards.map((card) => (
              <PlayingCard key={card} card={card} size={isMe ? 'lg' : 'sm'} className="deal-in" />
            ))}
          </div>
        )}
        <div className="seat__frame">
          <div className="seat__tile">
            <VideoTile
              stream={isMe ? video.local : video.remotes[seat.playerId]?.stream}
              isMe={isMe}
              camera={video.camera}
              state={video.remotes[seat.playerId]?.state}
              onRetry={video.retry}
            >
              <svg className="seat__silhouette" viewBox="0 0 120 90" aria-hidden="true">
                <circle cx="60" cy="34" r="16" />
                <path d="M26 90c0-20 15-32 34-32s34 12 34 32Z" />
              </svg>
            </VideoTile>
            {gestures?.status === 'on' && <GestureHold gestures={gestures} size={24} />}
            {/* Face-down cards in the corner of everyone else still in the hand */}
            {!isMe && hasCards && !holeCards?.length && (
              <span className="seat__backs" aria-hidden="true">
                <span />
                <span />
              </span>
            )}
            <span className="seat__strip">
              <span className="seat__name">{isMe ? 'You' : seat.name}</span>
              <span className="seat__stack tabular">{formatChips(seat.stack)}</span>
            </span>
          </div>
          {/* On the tile's corner, above everything, so bets and cards never cover it */}
          {isDealer && (
            <span className="seat__dealer">
              <DealerButton />
            </span>
          )}
        </div>
        {won > 0 ? (
          <span className="seat__note seat__note--winner">Wins {formatChips(won)}</span>
        ) : (
          note && <span className="seat__note">{note}</span>
        )}
      </div>
    </>
  );
}

/** Chips a player won in the finished hand (0 when none, or no result yet). */
function winnings(result, playerId) {
  if (!result || !playerId) return 0;
  return result.winners
    .filter((winner) => winner.playerId === playerId)
    .reduce((sum, winner) => sum + winner.amount, 0);
}

function Result({ result, nameOf, me }) {
  return (
    <div className="felt__result" role="status">
      {result.winners.map((winner) => (
        <p key={`${winner.playerId}-${winner.amount}`}>
          <strong>{winner.playerId === me ? 'You win' : `${nameOf(winner.playerId)} wins`}</strong>{' '}
          {formatChips(winner.amount)}
          {winner.handName ? ` · ${winner.handName}` : ''}
        </p>
      ))}
    </div>
  );
}

function CopyInvite({ code }) {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/tables/${code}`;
  return (
    <button
      type="button"
      className="btn btn--lime seat__invite"
      onClick={() =>
        navigator.clipboard
          ?.writeText(link)
          .then(() => setCopied(true))
          .catch(() => window.prompt('Copy this invite link', link))
      }
    >
      {copied ? 'Link copied' : '+ Copy invite link'}
    </button>
  );
}

/** "Code K7QX2M" in the top bar; a click copies the code. */
function CopyCode({ code }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="table-bar__pill table-bar__code"
      title={copied ? 'Code copied' : 'Copy the table code'}
      onClick={() =>
        navigator.clipboard
          ?.writeText(code)
          .then(() => setCopied(true))
          .catch(() => {})
      }
    >
      <span>Code {code}</span>
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {copied ? (
          <path d="m5 12 5 5 9-10" />
        ) : (
          <>
            <rect x="8" y="8" width="12" height="12" rx="2.5" />
            <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
          </>
        )}
      </svg>
    </button>
  );
}

function MicIcon({ off }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  );
}

/** Top players by chips, in the side column under the gestures. */
function TableLeaderboard({ playerId }) {
  const [rows, setRows] = useState(null); // null while loading, [] when unavailable or empty

  useEffect(() => {
    let active = true;
    playersApi
      .leaderboard()
      .then((data) => active && setRows(data))
      .catch(() => active && setRows([]));
    return () => {
      active = false;
    };
  }, []);

  if (!rows?.length) return null;
  return (
    <section className="panel table-board" aria-labelledby="table-board-title">
      <h2 id="table-board-title" className="table-board__title">
        Leaderboard
      </h2>
      <ol className="table-board__list">
        {rows.slice(0, 5).map((row, index) => {
          const isMe = row.id === playerId;
          return (
            <li
              key={row.id}
              className={isMe ? 'table-board__row table-board__row--me' : 'table-board__row'}
              aria-current={isMe ? 'true' : undefined}
            >
              <span className="table-board__rank tabular">{index + 1}</span>
              <span className="table-board__name">{isMe ? 'You' : row.name}</span>
              <span className="table-board__chips tabular">{formatChips(row.chips)}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

const PROBLEMS = {
  notFound: ['Table not found', 'This table doesn’t exist anymore.'],
  notAtTable: ['You’re not at this table', 'You left this table, or your seat was given up.'],
  unavailable: ['Tables unavailable', 'We couldn’t reach the game server. Try again in a moment.'],
};

function TableProblem({ code, problem }) {
  const [title, text] = PROBLEMS[problem];
  return (
    <main className="page stack" style={{ gap: 'var(--space-4)', paddingTop: 'var(--space-12)' }}>
      <p className="label">Table {code}</p>
      <h1>{title}</h1>
      <p className="muted">{text}</p>
      <p>
        <Link to="/lobby">Back to the lobby</Link>
      </p>
    </main>
  );
}
