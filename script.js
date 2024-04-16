const gameStart = document.getElementById('gameStart');
const descriptionBox = document.querySelector('.description-box');

gameStart.addEventListener('click', function() {
    gameStart.style.display = 'none';
    descriptionBox.classList.add('expanded');
});