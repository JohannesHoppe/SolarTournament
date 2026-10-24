import { describe, expect, it } from 'vitest';
import { isLeadHost, pingPeerOf } from './online';

describe('the peer a ship\'s ping is measured to', () => {
  it('is null for a ship this very browser runs: its own clone, and its own bots while it leads', () => {
    expect(pingPeerOf('p:me', 'me')).toBeNull();
    expect(pingPeerOf('b:me:0', 'me')).toBeNull();
  });

  it('is the peer that runs a remote Host\'s ship', () => {
    expect(pingPeerOf('p:other', 'me')).toBe('other');
  });

  it('is the lead browser for a bot, since only the lead runs bots: a bot\'s id embeds its peer', () => {
    expect(pingPeerOf('b:lead:3', 'me')).toBe('lead');
    // this browser leads itself and sees another peer's bot: still that peer, not this one
    expect(pingPeerOf('b:other:0', 'me')).toBe('other');
  });
});

describe('the lead mark', () => {
  it('marks a Host\'s own ship when this browser leads', () => {
    expect(isLeadHost('p:lead', 'lead')).toBe(true);
  });

  it('never marks a Host that does not lead', () => {
    expect(isLeadHost('p:other', 'lead')).toBe(false);
  });

  it('never marks a bot, even the lead\'s own', () => {
    expect(isLeadHost('b:lead:0', 'lead')).toBe(false);
  });
});
