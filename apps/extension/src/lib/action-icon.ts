const DEFAULT_ACTION_ICONS = {
  16: "icons/icon-16.png",
  32: "icons/icon-32.png",
  48: "icons/icon-48.png",
  128: "icons/icon-128.png",
} as const;

const PLAYING_ACTION_ICONS = {
  16: "icons/icon-16-playing.png",
  32: "icons/icon-32-playing.png",
  48: "icons/icon-48-playing.png",
  128: "icons/icon-128-playing.png",
} as const;

const DEFAULT_ACTION_TITLE = "Standard Reader";
const PLAYING_ACTION_TITLE = "Reading aloud — Standard Reader";

let actionIconPlaying = false;

export function isActionIconPlaying(): boolean {
  return actionIconPlaying;
}

export async function setActionIconPlaying(playing: boolean): Promise<void> {
  if (playing === actionIconPlaying) return;
  actionIconPlaying = playing;
  await browser.action.setIcon({
    path: playing ? PLAYING_ACTION_ICONS : DEFAULT_ACTION_ICONS,
  });
  await browser.action.setTitle({
    title: playing ? PLAYING_ACTION_TITLE : DEFAULT_ACTION_TITLE,
  });
}
