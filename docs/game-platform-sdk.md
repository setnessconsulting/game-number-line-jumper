# Game Platform SDK pilot

Number Line Jumper consumes `@setnessconsulting/game-platform-sdk` at the immutable
`8933746ebefe128a23b08f3fc9fd6796f4d906bd` revision (SDK 0.1.1). The dependency
is installed only for the browser runtime; no account or learner identity is
sent through the protocol.

When the arcade host supplies `gpsdkChannel` and `gpsdkSession` query values,
the game opens the SDK's same-origin iframe transport and advertises the
`number-line-jumper` web DOM identity. It enters the arcade host mode only after
accepting an embedded arcade handshake. A user exit sends one SDK
`COMPLETE_SESSION` event for that session. Direct launches, missing session
values, or an uncompleted handshake retain standalone play.

The game and host integration remain an SDK-10 pilot. The production game
artifact and games-site route have not been changed or promoted. Before SDK-10
can be accepted, record the actual candidate artifact and handshake, manifest
and lock hashes, bundle-size delta, rollback evidence, and independent
acceptance. Hosted CI also needs the existing read-only SDK deploy key in the
game repository's `GAME_PLATFORM_SDK_DEPLOY_KEY` Actions secret.
