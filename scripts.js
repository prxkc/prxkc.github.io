function loadContent(section) {
    const content = document.getElementById('content');

    // Don't hide content initially, just start fading in new content
    content.classList.remove('fade-out');
    content.classList.add('fade-in');

    // Load section items
    fetch(`${section}.txt`)
        .then(response => response.text())
        .then(text => {
            const items = text.split('\n').filter(item => item.trim() !== '');
            const sectionContent = createSectionContent(section.charAt(0).toUpperCase() + section.slice(1), items);
            content.innerHTML = sectionContent;

            // No need to animate in list items, they're visible by default now
            const listItems = content.querySelectorAll('li');

            // Add click event listeners to list items
            listItems.forEach(item => {
                item.addEventListener('click', () => loadPage(section, item.textContent));
            });
        })
        .catch(error => {
            console.error('Error loading content:', error);
            content.innerHTML = '<p>Error loading content. Please try again.</p>';
        });
}