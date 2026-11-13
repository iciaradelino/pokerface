import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { gameApi } from '../api/gameApi.js';
import { ApiError } from '../api/http.js';
import { playerColour } from '../components/Avatar.jsx';
import { Button } from '../components/Button.jsx';
import { ChipAmount, DealerButton, formatChips } from '../components/Chips.jsx';
import { Logo } from '../components/Logo.jsx';
import { CardSlot, PlayingCard } from '../components/PlayingCard.jsx';
import { normalizeCode } from '../tableCode.js';
import { ActionBar } from '../table/ActionBar.jsx';
import { STAGE_LABELS, arrangeSeats, potTotal, seatNote } from '../table/tableView.js';
import { useTableSocket } from '../table/useTableSocket.js';
import { usePlayer } from '../usePlayer.js';
import './TablePage.css';

// Where each spot sits on the felt, in % of the table (x, y). Spot 0 is you, at the bottom;
// the rest go clockwise. Fewer seats use fewer, evenly spread spots.
const B = [50, 100];
const SPOTS = {
  2: [B, [50, 0]],
  3: [B, [22, 4], [78, 4]],
  4: [B, [5, 50], [50, 0], [95, 50]],
  5: [B, [5, 55], [28, 0], [72, 0], [95, 55]],
  6: [B, [5, 55], [28, 0], [72, 0], [95, 55], [78, 100]],
};

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

  const { state: live, mine, connection } = useTableSocket(code, playerId);

  // Not at this table yet (e.g. someone opened the link): the waiting room seats you first.
  if (problem === 'notSeated') return <Navigate to={`/tables/${code}`} replace />;
  if (problem) return <TableProblem code={code} problem={problem} />;

  const state = live ?? (table ? stateFromTable(table) : null);
  const maxSeats = table?.maxSeats ?? 6;
  const pot = potTotal(state?.pots);
  const nameOf = (id) => state?.seats.find((seat) => seat.playerId === id)?.name ?? 'Someone';
  const stage = state?.stage ?? 'waiting';
  const handLabel =
    state && state.handNumber > 0
      ? `Hand #${state.handNumber} · ${STAGE_LABELS[stage]}`
      : 'No hand yet';

  return (
    <div className="table-page">
      <header className="table-bar">
        <div className="row table-bar__info">
          <Logo />
          <span className="table-bar__title">Private table</span>
          <span className="pill pill--quiet pill--sm">Code {code}</span>
          {table && (
            <span className="pill pill--quiet pill--sm tabular">
              Blinds {formatChips(table.smallBlind)} / {formatChips(table.bigBlind)}
            </span>
          )}
          <span className="pill pill--quiet pill--sm">{handLabel}</span>
        </div>
        <Button variant="outline" onClick={() => navigate('/lobby')}>
          Leave table
        </Button>
      </header>

      <main className="table-page__main">
        {connection !== 'open' && (
          <div className="banner" role="status">
            {connection === 'connecting'
              ? 'Connecting to the table…'
              : 'Connection lost. Reconnecting…'}
          </div>
        )}

        <section className="felt-wrap" aria-label="Table">
          <div className="felt">
            <span className="felt__brand" aria-hidden="true">
              POKERFACE
            </span>

            <div className="felt__centre">
              {pot > 0 && (
                <div className="felt__pot">
                  <ChipAmount amount={pot} label="Pot" />
                </div>
              )}
              <div className="felt__board" aria-label="Board">
                {Array.from({ length: 5 }, (_, i) =>
                  state?.board[i] ? (
                    <PlayingCard key={i} card={state.board[i]} size="md" />
                  ) : (
                    <CardSlot key={i} size="md" />
                  ),
                )}
              </div>
              {state?.result && <Result result={state.result} nameOf={nameOf} me={playerId} />}
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
                  position={(SPOTS[maxSeats] ?? SPOTS[6])[spot]}
                  seat={seat}
                  code={code}
                  isMe={seat?.playerId === playerId}
                  colour={seat?.playerId === playerId && player ? player.avatar : seat?.playerId}
                  isDealer={seat !== null && seat.playerId === state.dealer}
                  note={
                    seat
                      ? seatNote(seat, { currentPlayer: state.currentPlayer, myPlayerId: playerId })
                      : ''
                  }
                  holeCards={
                    seat?.playerId === playerId
                      ? mine?.holeCards
                      : state.result?.revealed?.[seat?.playerId]
                  }
                />
              ))}
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
        />
      </main>
    </div>
  );
}

function SeatSpot({ position, seat, code, isMe, colour, isDealer, note, holeCards }) {
  const [x, y] = position;
  // Bets sit between the seat and the middle of the table.
  const betStyle = { left: `${x + (50 - x) * 0.42}%`, top: `${y + (50 - y) * 0.45}%` };

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
              <PlayingCard key={card} card={card} size={isMe ? 'lg' : 'sm'} />
            ))}
          </div>
        )}
        <div className="seat__tile">
          <svg className="seat__silhouette" viewBox="0 0 120 90" aria-hidden="true">
            <circle cx="60" cy="34" r="16" />
            <path d="M26 90c0-20 15-32 34-32s34 12 34 32Z" />
          </svg>
          <span className="seat__strip">
            <span className="seat__name">{isMe ? 'You' : seat.name}</span>
            <span className="tabular">{formatChips(seat.stack)}</span>
          </span>
          {isDealer && (
            <span className="seat__dealer">
              <DealerButton />
            </span>
          )}
        </div>
        {note && <span className="seat__note">{note}</span>}
      </div>
      {seat.bet > 0 && (
        <span className="seat__bet" style={betStyle}>
          <ChipAmount amount={seat.bet} />
        </span>
      )}
    </>
  );
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

const PROBLEMS = {
  notFound: ['Table not found', 'This table doesn’t exist anymore.'],
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
