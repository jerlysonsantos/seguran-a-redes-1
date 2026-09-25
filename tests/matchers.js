/**
 * expect(lines).toContainPacket('10.0.1.10 >', 'echo request')
 * Passes when some tcpdump line contains all the given fragments.
 */
expect.extend({
  toContainPacket(lines, ...fragments) {
    const pass = lines.some((l) => fragments.every((f) => l.includes(f)));
    const expected = fragments.map((f) => `"${f}"`).join(' and ');
    return {
      pass,
      message: () =>
        `expected ${pass ? 'no' : 'some'} packet containing ${expected}\n` +
        `Captured packets:\n${lines.join('\n') || '(none)'}`,
    };
  },
});
