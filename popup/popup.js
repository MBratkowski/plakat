(async () => {
  const P = Plakat;
  P.ui.localize();
  await P.loadFonts();
  const settings = await P.loadSettings();
  for (const key of ['enabled', 'hoverReveal']) {
    const box = document.getElementById(key);
    box.checked = !!settings[key];
    box.addEventListener('change', () => {
      settings[key] = box.checked;
      P.saveSettings(settings);
    });
  }
  document.getElementById('open').addEventListener('click', () => chrome.runtime.openOptionsPage());

  // Small preview: a random style from the pool on a sample title
  const styles = P.allStyles(settings).filter((s) => settings.pool.includes(s.id));
  const style = styles[Math.floor(Math.random() * styles.length)] || P.BUILTIN_STYLES[0];
  const titles = [P.t('popupSampleTitle1'), P.t('popupSampleTitle2'), P.t('popupSampleTitle3')];
  const t = titles[Math.floor(Math.random() * titles.length)];
  const seed = String(Math.random());
  document.getElementById('preview').appendChild(
    P.toDom(P.render({ style, title: t, channelName: P.t('popupSampleChannel'), channelKey: seed, vid: seed })),
  );
})();
