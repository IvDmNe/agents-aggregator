import type { AgentType } from '../../shared/types';
import type { Parser } from './base';
import { claudeParser } from './claude';
import { piParser } from './pi';

const parsers: Record<AgentType, Parser | null> = {
  pi: piParser,
  claude: claudeParser,
  codex: null,     // Phase 4
  opencode: null,  // Phase 5
};

export function parserFor(agent: AgentType): Parser | null {
  return parsers[agent];
}

export { sniffAgent } from './base';
