# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report them privately through GitHub:
**[Report a vulnerability](https://github.com/danil-labs/danil/security/advisories/new)**
(Security tab → *Report a vulnerability*). Only the maintainers can see the
report.

Include what you can:

- the affected version (bottom-right corner of the window) and platform;
- what an attacker can do and under which conditions;
- steps or a proof of concept to reproduce it.

We acknowledge reports within five business days, keep you informed while we
work on a fix, and credit you in the advisory unless you prefer otherwise.

## Scope

In scope:

- the Danil window and its front (this repository);
- the release pipeline and the `npx` installer;
- how the window handles content produced by agents (artifacts, Markdown,
  links, embedded sites) — see [tests/security/](apps/desktop/tests/security/README.md) for the existing
  containment tests;
- the engine `seldon-runtime` as shipped with Danil. Its source is not
  public, but reports about its behavior are welcome through the same channel.

Out of scope: vulnerabilities in third-party agent CLIs or providers
themselves (report them to their vendors), and issues that require an attacker
who already controls the user's account on the machine.

## Supported versions

Security fixes go into the latest release. The app updates itself, so the
latest release is the supported one.
