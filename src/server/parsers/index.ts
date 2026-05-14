import type { AgentType } from '../../shared/types';
import type { Parser } from './base';
import { claudeParser } from './claude';
import { codexParser } from './codex';
import { opencodeParser } from './opencode';
import { piParser } from './pi';

const parsers: Record<AgentType, Parser | null> = {
  pi: piParser,
  claude: claudeParser,
  codex: codexParser,
  opencode: opencodeParser,
};

export function parserFor(agent: AgentType): Parser | null {
  return parsers[agent];
}

export { sniffAgent } from './base';
