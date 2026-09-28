import '../pages.js';

// Make navigation usable before loading the optional 3D environment.
requestAnimationFrame(() => {
  import('./scene.js').catch(error => {
    document.querySelector('.daylight').dataset.state = 'still';
    console.warn('The 3D light is unavailable; showing the still background.', error);
  });
});
