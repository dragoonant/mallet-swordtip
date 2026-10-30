// Which realm side of Fire and Jade the running game is on, for the things that only look different (ground mat, light,
// ambience). It reads the engine's choice once made (mission.custom.side) and the start screen's pre-fill before that;
// Aqshy when there is no game. Presentational only: nothing here feeds back into the rules.
import { useGameStore, type Realm } from '../store/game'

export type { Realm }

export function useRealmSide(): Realm {
  return useGameStore((s) => {
    const side = s.state?.mission.custom.side ?? s.setup?.side
    return side === 'ghyran' ? 'ghyran' : 'aqshy'
  })
}
