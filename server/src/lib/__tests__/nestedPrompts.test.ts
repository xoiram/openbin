import { describe, expect, it } from 'vitest';
import { buildSystemPrompt as buildCommandSystemPrompt, buildUnifiedSystemPrompt } from '../commandParser.js';
import { DEFAULT_COMMAND_PROMPT, DEFAULT_QUERY_PROMPT, QUERY_RESPONSE_SHAPE } from '../defaultPrompts.js';
import { buildSystemPrompt as buildQuerySystemPrompt } from '../inventoryQuery.js';

describe('nested boxes in the built-in prompts', () => {
  const command = buildCommandSystemPrompt(['red'], ['Box']);

  it('delete_bin trashes boxes inside; set_area is not allowed on a child; delete_area unassigns loose items', () => {
    expect(command).toMatch(/delete_bin:.*boxes inside it are trashed with it/i);
    expect(command).toMatch(/set_area:.*NOT allowed for a box that is inside another box/);
    expect(command).toMatch(/delete_area:.*boxes AND loose items.*unassigned/);
  });

  it('has a nesting rule and a read-only loose items rule', () => {
    expect(command).toMatch(/Nested boxes:.*parent_bin_code/s);
    expect(command).toMatch(/"loose_items".*READ-ONLY/s);
    expect(command).toMatch(/commands cannot change items outside a box yet/i);
  });

  it('command rule 5 and the loose-items note are in the default command prompt, loose items are not an id source', () => {
    expect(DEFAULT_COMMAND_PROMPT).toMatch(/set_area.*parent_bin_code.*NEVER emit set_area/s);
    expect(DEFAULT_COMMAND_PROMPT).toMatch(/loose_items.*READ-ONLY/s);
    expect(DEFAULT_COMMAND_PROMPT).toMatch(/Absolute Rule C does NOT make them valid id sources/);
    // Rule C itself must not list loose items among the verified id sources.
    const ruleC = DEFAULT_COMMAND_PROMPT.split('ABSOLUTE RULE C')[1].split('ABSOLUTE RULE D')[0];
    expect(ruleC).not.toMatch(/loose/i);
  });

  it('the query prompt asks for the full path and keeps loose items out of matches; the response shape stays bin-only', () => {
    expect(DEFAULT_QUERY_PROMPT).toMatch(/full path/);
    expect(DEFAULT_QUERY_PROMPT).toMatch(/loose_items.*NOT bins.*never put them in "matches"/s);
    expect(QUERY_RESPONSE_SHAPE).toContain('"bin_code"');
    expect(QUERY_RESPONSE_SHAPE).not.toMatch(/loose|item_id|kind/);
    expect(buildQuerySystemPrompt()).toContain(DEFAULT_QUERY_PROMPT);
  });

  it('a custom prompt replaces only the default text, not the action reference', () => {
    const custom = buildCommandSystemPrompt(['red'], ['Box'], 'MY CUSTOM PROMPT');
    expect(custom).toContain('MY CUSTOM PROMPT');
    expect(custom).not.toContain('Absolute Rule C does NOT');
    expect(custom).toMatch(/delete_bin:.*trashed with it/i);
  });

  it('the unified prompt carries both', () => {
    const unified = buildUnifiedSystemPrompt(['red'], ['Box']);
    expect(unified).toMatch(/READ-ONLY/);
    expect(unified).toMatch(/full path/);
  });
});
