function render(data) {
    const trackedIcon = document.getElementById('tracked-icon');
    const trackedName = document.getElementById('tracked-name');
    const membersList = document.getElementById('members-list');

    if (data.tracked) {
        trackedName.textContent = data.tracked.name;
        trackedIcon.classList.remove('muted', 'unmuted');
        trackedIcon.classList.add(data.tracked.muted ? 'muted' : 'unmuted');
    } else {
        trackedName.textContent = 'Not in channel';
        trackedIcon.classList.remove('muted', 'unmuted');
        trackedIcon.classList.add('muted');
    }

    membersList.innerHTML = '';
    (data.members || []).forEach((m) => {
        const li = document.createElement('li');
        li.className = 'member-item';

        const dot = document.createElement('div');
        dot.className = 'member-dot ' + (m.muted ? 'muted' : 'unmuted');

        const label = document.createElement('span');
        label.textContent = m.name;

        li.appendChild(dot);
        li.appendChild(label);
        membersList.appendChild(li);
    });
}

window.voiceApi.onUpdate((data) => {
    render(data);
});

window.addEventListener('DOMContentLoaded', async () => {
    const data = await window.voiceApi.getCurrent();
    render(data);
});
