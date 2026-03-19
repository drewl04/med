(() => {
    'use strict';

    /* =========================
       DOM REFERENCES
       ========================= */
    const dom = {
        sidebar: document.getElementById('sidebar'),
        toggleSidebar: document.getElementById('button-toggle-sidebar'),

        chapterList: document.getElementById('chapter-list'),
        addChapter: document.getElementById('button-add-chapter'),

        buttonEditor: document.getElementById('button-enter-editor'),
        buttonImages: document.getElementById('button-enter-images'),
        buttonPractice: document.getElementById('button-enter-practice'),

        viewEditor: document.getElementById('view-editor'),
        viewImages: document.getElementById('view-images'),
        viewPractice: document.getElementById('view-practice'),

        inputQuestions: document.getElementById('input-questions'),
        inputTime: document.getElementById('input-time'),

        chapterSelect: document.getElementById('editor-chapter-select'),
        addQuestion: document.getElementById('button-add-question'),
        addImage: document.getElementById('button-add-image'),
        toggleCollapse: document.getElementById('button-toggle-collapse'),
        editorItems: document.getElementById('editor-items'),
        imageUploadInput: document.getElementById('image-upload-input'),

        imagesCurrent: document.getElementById('images-current'),
        imagesNext: document.getElementById('images-next'),
        imagesExplanationPanel: document.getElementById('explanation-panel'),
        imagesExplanation: document.getElementById('images-explanation'),
        imagesToggleExplanation: document.getElementById('images-toggle-explanation'),

        practiceQuestion: document.getElementById('practice-question'),
        practiceAnswers: document.getElementById('practice-answers'),
        practiceSubmit: document.getElementById('practice-submit'),
        practiceExplanationPanel: document.getElementById('practice-explanation-panel'),
        practiceExplanation: document.getElementById('practice-explanation'),
        practiceToggleExplanation: document.getElementById('practice-toggle-explanation')
    };

    /* =========================
       APPLICATION STATE
       ========================= */
    const state = {
        database: createEmptyDatabase(),
        currentView: 'practice',
        editorChapterId: null,
        saveTimer: null,
        imagesExplanationVisible: false,
        currentImageId: null,
        practice: {
            questions: [],
            currentQuestionId: null,
            answered: false,
            recentQuestionIds: [],
            recentBufferSize: 5
        }
    };

    const DRAG_TYPES = {
        CHAPTER: 'chapter',
        EDITOR_ITEM: 'editor-item'
    };

    /* =========================
       DATA MODEL HELPERS
       ========================= */
    function createEmptyDatabase() {
        return {
            meta: {
                version: 2,
                nextChapterId: 1,
                nextQuestionId: 1,
                nextImageId: 1
            },
            chapters: []
        };
    }

    function createChapter(name) {
        return {
            id: state.database.meta.nextChapterId++,
            name,
            questions: [],
            images: [],
            order: []
        };
    }

    function createQuestion() {
        return {
            id: state.database.meta.nextQuestionId++,
            type: 'question',
            question: '',
            answers: Array.from({ length: 5 }, () => ({ text: '', correct: false })),
            explanation: '',
            collapsed: false,
            weight: 1
        };
    }

    function createImageItem(imagePath) {
        return {
            id: state.database.meta.nextImageId++,
            type: 'image',
            image: '',
            imagePath,
            explanation: '',
            collapsed: false
        };
    }

    function ensureDatabaseShape(rawData) {
        if (!rawData) {
            return createEmptyDatabase();
        }

        // New format already present.
        if (rawData.meta && Array.isArray(rawData.chapters)) {
            const db = createEmptyDatabase();
            db.meta = {
                version: 2,
                nextChapterId: Number(rawData.meta.nextChapterId) || 1,
                nextQuestionId: Number(rawData.meta.nextQuestionId) || 1,
                nextImageId: Number(rawData.meta.nextImageId) || 1
            };

            db.chapters = rawData.chapters.map(normalizeChapter);
            recalculateMetaCounters(db);
            return db;
        }

        // Legacy format migration.
        if (Array.isArray(rawData)) {
            const db = createEmptyDatabase();

            rawData.forEach((legacyChapter, chapterIndex) => {
                const chapterId = Number.isFinite(legacyChapter.id) ? legacyChapter.id : db.meta.nextChapterId++;
                db.meta.nextChapterId = Math.max(db.meta.nextChapterId, chapterId + 1);

                const chapter = {
                    id: chapterId,
                    name: legacyChapter.name || `chapter ${chapterIndex + 1}`,
                    questions: [],
                    images: [],
                    order: []
                };

                const legacyItems = Array.isArray(legacyChapter.questions) ? legacyChapter.questions : [];

                legacyItems.forEach((item) => {
                    if (Array.isArray(item.answers)) {
                        const question = {
                            id: db.meta.nextQuestionId++,
                            type: 'question',
                            question: item.question || '',
                            answers: normalizeAnswers(item.answers),
                            explanation: item.explanation || '',
                            collapsed: Boolean(item.collapsed),
                            weight: normalizeWeight(item.weight)
                        };

                        chapter.questions.push(question);
                        chapter.order.push({ type: 'question', id: question.id });
                        return;
                    }

                    if (item.imagePath) {
                        const image = {
                            id: db.meta.nextImageId++,
                            type: 'image',
                            image: item.image || '',
                            imagePath: item.imagePath,
                            explanation: item.explanation || '',
                            collapsed: Boolean(item.collapsed)
                        };

                        chapter.images.push(image);
                        chapter.order.push({ type: 'image', id: image.id });
                    }
                });

                db.chapters.push(chapter);
            });

            recalculateMetaCounters(db);
            return db;
        }

        return createEmptyDatabase();
    }

    function normalizeChapter(chapter) {
        const normalized = {
            id: Number(chapter.id),
            name: chapter.name || 'chapter',
            questions: Array.isArray(chapter.questions) ? chapter.questions.map(normalizeQuestion) : [],
            images: Array.isArray(chapter.images) ? chapter.images.map(normalizeImage) : [],
            order: Array.isArray(chapter.order) ? chapter.order.map(normalizeOrderEntry).filter(Boolean) : []
        };

        if (!normalized.order.length) {
            normalized.questions.forEach((question) => {
                normalized.order.push({ type: 'question', id: question.id });
            });
            normalized.images.forEach((image) => {
                normalized.order.push({ type: 'image', id: image.id });
            });
        }

        normalized.order = normalized.order.filter((entry) => {
            if (entry.type === 'question') {
                return normalized.questions.some((question) => question.id === entry.id);
            }
            if (entry.type === 'image') {
                return normalized.images.some((image) => image.id === entry.id);
            }
            return false;
        });

        // Any orphaned entities are appended so nothing disappears silently.
        normalized.questions.forEach((question) => {
            if (!normalized.order.some((entry) => entry.type === 'question' && entry.id === question.id)) {
                normalized.order.push({ type: 'question', id: question.id });
            }
        });
        normalized.images.forEach((image) => {
            if (!normalized.order.some((entry) => entry.type === 'image' && entry.id === image.id)) {
                normalized.order.push({ type: 'image', id: image.id });
            }
        });

        return normalized;
    }

    function normalizeQuestion(question) {
        return {
            id: Number(question.id),
            type: 'question',
            question: question.question || '',
            answers: normalizeAnswers(question.answers),
            explanation: question.explanation || '',
            collapsed: Boolean(question.collapsed),
            weight: normalizeWeight(question.weight)
        };
    }

    function normalizeImage(image) {
        return {
            id: Number(image.id),
            type: 'image',
            image: image.image || '',
            imagePath: image.imagePath || '',
            explanation: image.explanation || '',
            collapsed: Boolean(image.collapsed)
        };
    }

    function normalizeOrderEntry(entry) {
        if (!entry || (entry.type !== 'question' && entry.type !== 'image')) {
            return null;
        }

        return {
            type: entry.type,
            id: Number(entry.id)
        };
    }

    function normalizeAnswers(answers) {
        const safeAnswers = Array.isArray(answers) ? answers.slice(0, 5) : [];
        while (safeAnswers.length < 5) {
            safeAnswers.push({ text: '', correct: false });
        }

        return safeAnswers.map((answer) => ({
            text: answer?.text || '',
            correct: Boolean(answer?.correct)
        }));
    }

    function normalizeWeight(value) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric < 1) {
            return 1;
        }
        return Math.max(1, Math.min(5, numeric));
    }

    function recalculateMetaCounters(database) {
        let maxChapterId = 0;
        let maxQuestionId = 0;
        let maxImageId = 0;

        database.chapters.forEach((chapter) => {
            maxChapterId = Math.max(maxChapterId, Number(chapter.id) || 0);
            chapter.questions.forEach((question) => {
                maxQuestionId = Math.max(maxQuestionId, Number(question.id) || 0);
            });
            chapter.images.forEach((image) => {
                maxImageId = Math.max(maxImageId, Number(image.id) || 0);
            });
        });

        database.meta.nextChapterId = Math.max(database.meta.nextChapterId || 1, maxChapterId + 1);
        database.meta.nextQuestionId = Math.max(database.meta.nextQuestionId || 1, maxQuestionId + 1);
        database.meta.nextImageId = Math.max(database.meta.nextImageId || 1, maxImageId + 1);
    }

    function getChapters() {
        return state.database.chapters;
    }

    function getEditorChapter() {
        return getChapters().find((chapter) => chapter.id === state.editorChapterId) || null;
    }

    function getChapterById(chapterId) {
        return getChapters().find((chapter) => chapter.id === chapterId) || null;
    }

    function getChapterListButton(chapterId) {
        return dom.chapterList.querySelector(`[data-id="${chapterId}"] .chapter-button`);
    }

    function isChapterActive(chapterId) {
        const button = getChapterListButton(chapterId);
        return button ? button.classList.contains('active') : false;
    }

    function getQuestionById(chapter, questionId) {
        return chapter.questions.find((question) => question.id === questionId) || null;
    }

    function getImageById(chapter, imageId) {
        return chapter.images.find((image) => image.id === imageId) || null;
    }

    function getOrderedItems(chapter) {
        return chapter.order
            .map((entry) => {
                if (entry.type === 'question') {
                    return getQuestionById(chapter, entry.id);
                }
                if (entry.type === 'image') {
                    return getImageById(chapter, entry.id);
                }
                return null;
            })
            .filter(Boolean);
    }

    /* =========================
       SERVER COMMUNICATION
       ========================= */
    async function loadDatabase() {
        const response = await fetch('/api/chapters');
        if (!response.ok) {
            throw new Error('Failed to load chapters');
        }

        const data = await response.json();
        state.database = ensureDatabaseShape(data);

        if (!getEditorChapter() && getChapters().length) {
            state.editorChapterId = getChapters()[0].id;
        }
    }

    async function saveDatabase() {
        const response = await fetch('/api/chapters', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(state.database)
        });

        if (!response.ok) {
            throw new Error('Failed to save chapters');
        }
    }

    function debouncedSave() {
        clearTimeout(state.saveTimer);
        state.saveTimer = setTimeout(async () => {
            try {
                await saveDatabase();
            } catch (error) {
                console.error(error);
            }
        }, 400);
    }

    /* =========================
       SIDEBAR / VIEW MANAGEMENT
       ========================= */
    function showView(viewName) {
        state.currentView = viewName;

        const views = {
            editor: dom.viewEditor,
            images: dom.viewImages,
            practice: dom.viewPractice
        };

        Object.entries(views).forEach(([name, element]) => {
            const isActive = name === viewName;
            element.hidden = !isActive;
            element.classList.toggle('is-active', isActive);
        });

        dom.buttonEditor.classList.toggle('active', viewName === 'editor');
        dom.buttonImages.classList.toggle('active', viewName === 'images');
        dom.buttonPractice.classList.toggle('active', viewName === 'practice');

        updateSidebarDisplay();

        if (viewName === 'images') {
            state.currentImageId = null;
            showRandomImage();
        }

        if (viewName === 'practice') {
            startPractice();
        }
    }

    function updateSidebarDisplay() {
        const expanded = dom.sidebar.classList.contains('expanded');
        const middleSection = dom.chapterList.closest('.sidebar-section-middle');
        const bottomSection = dom.inputQuestions.closest('.sidebar-section-bottom');

        if (!expanded) {
            middleSection.style.display = '';
            bottomSection.style.display = '';
            dom.addChapter.style.display = '';
            updateChapterControls();
            return;
        }

        middleSection.style.display = 'flex';

        if (state.currentView === 'editor') {
            bottomSection.style.display = 'flex';
            dom.addChapter.style.display = 'block';
        } else {
            bottomSection.style.display = 'none';
            dom.addChapter.style.display = 'none';
        }

        updateChapterControls();
    }

    function updateChapterControls() {
        const showDelete = state.currentView === 'editor';
        dom.chapterList.querySelectorAll('.delete-chapter').forEach((button) => {
            button.style.display = showDelete ? 'flex' : 'none';
        });
    }

    /* =========================
       CHAPTER LIST RENDERING
       ========================= */
    function renderChapterList() {
        dom.chapterList.innerHTML = '';

        getChapters().forEach((chapter) => {
            dom.chapterList.appendChild(createChapterListItem(chapter));
        });

        updateChapterControls();
    }

    function createChapterListItem(chapter) {
    const item = document.createElement('li');
    item.className = 'chapter-list-item';
    item.dataset.id = String(chapter.id);
    item.draggable = true;

    const deleteButton = document.createElement('span');
    deleteButton.className = 'delete-chapter';
    deleteButton.textContent = '✖';
    deleteButton.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
    });
    deleteButton.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await deleteChapter(chapter.id);
    });

    const chapterButton = document.createElement('button');
    chapterButton.type = 'button';
    chapterButton.className = 'chapter-button active';

    const checkmark = document.createElement('span');
    checkmark.className = 'checkmark';
    checkmark.textContent = '✔';

    const label = document.createElement('span');
    label.className = 'chapter-button-label';
    label.textContent = chapter.name;

    chapterButton.append(checkmark, label);

    chapterButton.addEventListener('click', (event) => {
        if (item.classList.contains('dragging')) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        toggleChapterActive(chapter.id);
    });

    label.addEventListener('dblclick', (event) => {
        if (state.currentView !== 'editor') {
            return;
        }

        event.stopPropagation();
        startInlineChapterEdit(chapter, label);
    });

    enableDesktopDrag(item, DRAG_TYPES.CHAPTER);
    enableTouchReorder(item, dom.chapterList, DRAG_TYPES.CHAPTER, applyChapterOrderFromDOM);

    item.append(deleteButton, chapterButton);
    return item;
    }

    function startInlineChapterEdit(chapter, labelElement) {
        const input = document.createElement('input');
        input.className = 'chapter-name-edit';
        input.value = chapter.name;

        labelElement.replaceWith(input);
        input.focus();
        input.select();

        const save = () => {
            const nextName = input.value.trim();
            if (nextName) {
                chapter.name = nextName;
            }
            populateChapterDropdown();
            renderChapterList();
            debouncedSave();
        };

        input.addEventListener('blur', save, { once: true });
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                save();
            }
        });
    }

    function toggleChapterActive(chapterId) {
        const button = getChapterListButton(chapterId);
        if (!button) {
            return;
        }

        button.classList.toggle('active');

        if (state.currentView === 'practice') {
            startPractice();
        }

        if (state.currentView === 'images') {
            state.currentImageId = null;
            showRandomImage();
        }
    }

    async function deleteChapter(chapterId) {
        const chapter = getChapterById(chapterId);
        if (!chapter) {
            return;
        }

        const imagePaths = chapter.images.map((image) => image.imagePath).filter(Boolean);

        if (imagePaths.length) {
            try {
                await fetch('/api/delete-images', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ paths: imagePaths })
                });
            } catch (error) {
                console.error('Failed to delete chapter images', error);
            }
        }

        state.database.chapters = getChapters().filter((chapterItem) => chapterItem.id !== chapterId);

        if (state.editorChapterId === chapterId) {
            state.editorChapterId = getChapters()[0]?.id ?? null;
        }

        populateChapterDropdown();
        renderChapterList();
        renderEditorItems();
        debouncedSave();
    }

    function addChapter() {
        const chapterNumber = getChapters().length + 1;
        const chapter = createChapter(`chapter ${chapterNumber}`);
        state.database.chapters.push(chapter);

        if (!state.editorChapterId) {
            state.editorChapterId = chapter.id;
        }

        renderChapterList();
        populateChapterDropdown();
        debouncedSave();
    }

    function applyChapterOrderFromDOM() {
        const ids = Array.from(dom.chapterList.querySelectorAll('.chapter-list-item'))
            .map((item) => Number(item.dataset.id));

        state.database.chapters.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
        populateChapterDropdown();
        debouncedSave();
    }

    function populateChapterDropdown() {
        dom.chapterSelect.innerHTML = '';

        getChapters().forEach((chapter) => {
            const option = document.createElement('option');
            option.value = String(chapter.id);
            option.textContent = chapter.name;

            if (chapter.id === state.editorChapterId) {
                option.classList.add('active-chapter-option');
            }

            dom.chapterSelect.appendChild(option);
        });

        if (!state.editorChapterId && getChapters().length) {
            state.editorChapterId = getChapters()[0].id;
        }

        if (state.editorChapterId) {
            dom.chapterSelect.value = String(state.editorChapterId);
        }

        renderEditorItems();
    }

    /* =========================
       EDITOR RENDERING
       ========================= */
    function renderEditorItems() {
        const chapter = getEditorChapter();
        dom.editorItems.innerHTML = '';

        if (!chapter) {
            updateCollapseButton();
            return;
        }

        getOrderedItems(chapter).forEach((item, index) => {
            dom.editorItems.appendChild(createEditorItem(chapter, item, index));
        });

        updateCollapseButton();
    }

    function updateCollapseButton() {
        const chapter = getEditorChapter();
        if (!chapter) {
            dom.toggleCollapse.textContent = 'collapse all';
            return;
        }

        const anyCollapsed = getOrderedItems(chapter).some((item) => item.collapsed);
        dom.toggleCollapse.textContent = anyCollapsed ? 'expand all' : 'collapse all';
    }

    function createEditorItem(chapter, item, index) {
        if (item.type === 'image') {
            return createImageEditorItem(chapter, item, index);
        }
        return createQuestionEditorItem(chapter, item, index);
    }

    function createQuestionEditorItem(chapter, question, index) {
        const box = document.createElement('div');
        box.className = 'editor-item';
        box.draggable = true;
        box.dataset.type = 'question';
        box.dataset.id = String(question.id);

        const header = createEditorHeader(index, question.collapsed, question.question, 'Question title', () => {
            removeQuestion(chapter, question.id);
        }, (value) => {
            question.question = value;
            debouncedSave();
        });

        const content = document.createElement('div');
        content.className = 'question-content';
        content.hidden = question.collapsed;

        const answers = document.createElement('div');
        answers.className = 'answers';

        question.answers.forEach((answer, answerIndex) => {
            const row = document.createElement('div');
            row.className = 'answer-row';

            const indicator = document.createElement('div');
            indicator.className = 'answer-indicator';
            indicator.classList.toggle('correct', answer.correct);

            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = `answer ${answerIndex + 1}`;
            input.value = answer.text;

            input.addEventListener('input', () => {
                answer.text = input.value;
                debouncedSave();
            });

            row.addEventListener('click', (event) => {
                if (event.target === input) {
                    return;
                }
                answer.correct = !answer.correct;
                indicator.classList.toggle('correct', answer.correct);
                debouncedSave();
            });

            row.append(indicator, input);
            answers.appendChild(row);
        });

        const explanation = document.createElement('textarea');
        explanation.className = 'explanation-area';
        explanation.placeholder = 'Explanation (optional)';
        explanation.value = question.explanation;
        explanation.addEventListener('input', () => {
            question.explanation = explanation.value;
            debouncedSave();
        });

        content.append(answers, explanation);
        box.append(header.wrapper, content);

        header.wrapper.addEventListener('click', (event) => {
            if (event.target === header.input || event.target === header.deleteButton) {
                return;
            }

            question.collapsed = !question.collapsed;
            content.hidden = question.collapsed;
            header.arrow.textContent = question.collapsed ? '▶' : '▼';
            updateCollapseButton();
            debouncedSave();
        });

        enableDesktopDrag(box, DRAG_TYPES.EDITOR_ITEM);
        enableTouchReorder(box, dom.editorItems, DRAG_TYPES.EDITOR_ITEM, applyEditorItemOrderFromDOM);
        return box;
    }

    function createImageEditorItem(chapter, image, index) {
        const box = document.createElement('div');
        box.className = 'editor-item';
        box.draggable = true;
        box.dataset.type = 'image';
        box.dataset.id = String(image.id);

        const header = createEditorHeader(index, image.collapsed, image.image, 'Image title', async () => {
            await removeImage(chapter, image.id);
        }, (value) => {
            image.image = value;
            debouncedSave();
        });

        const content = document.createElement('div');
        content.className = 'question-content';
        content.hidden = image.collapsed;

        const preview = document.createElement('img');
        preview.className = 'image-added';
        preview.src = image.imagePath;
        preview.alt = image.image || 'Image preview';

        const explanation = document.createElement('textarea');
        explanation.className = 'explanation-area';
        explanation.placeholder = 'Explanation / caption (optional)';
        explanation.value = image.explanation;
        explanation.addEventListener('input', () => {
            image.explanation = explanation.value;
            debouncedSave();
        });

        content.append(preview, explanation);
        box.append(header.wrapper, content);

        header.wrapper.addEventListener('click', (event) => {
            if (event.target === header.input || event.target === header.deleteButton) {
                return;
            }

            image.collapsed = !image.collapsed;
            content.hidden = image.collapsed;
            header.arrow.textContent = image.collapsed ? '▶' : '▼';
            updateCollapseButton();
            debouncedSave();
        });

        enableDesktopDrag(box, DRAG_TYPES.EDITOR_ITEM);
        enableTouchReorder(box, dom.editorItems, DRAG_TYPES.EDITOR_ITEM, applyEditorItemOrderFromDOM);
        return box;
    }

    function createEditorHeader(index, collapsed, value, placeholder, onDelete, onInput) {
        const wrapper = document.createElement('div');
        wrapper.className = 'question-header';

        const arrow = document.createElement('span');
        arrow.className = 'collapse-arrow';
        arrow.textContent = collapsed ? '▶' : '▼';

        const number = document.createElement('span');
        number.className = 'question-number';
        number.textContent = `#${index + 1}`;

        const input = document.createElement('input');
        input.className = 'inline-edit';
        input.type = 'text';
        input.placeholder = placeholder;
        input.value = value;
        input.addEventListener('input', () => onInput(input.value));

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'delete-question';
        deleteButton.textContent = '🗑';
        deleteButton.addEventListener('click', (event) => {
            event.stopPropagation();
            onDelete();
        });

        wrapper.append(arrow, number, input, deleteButton);
        return { wrapper, arrow, input, deleteButton };
    }

    function removeQuestion(chapter, questionId) {
        chapter.questions = chapter.questions.filter((question) => question.id !== questionId);
        chapter.order = chapter.order.filter((entry) => !(entry.type === 'question' && entry.id === questionId));
        renderEditorItems();
        debouncedSave();
    }

    async function removeImage(chapter, imageId) {
        const image = getImageById(chapter, imageId);
        if (!image) {
            return;
        }

        if (image.imagePath) {
            try {
                await fetch('/api/delete-image', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: image.imagePath })
                });
            } catch (error) {
                console.error('Failed to delete image', error);
            }
        }

        chapter.images = chapter.images.filter((imageItem) => imageItem.id !== imageId);
        chapter.order = chapter.order.filter((entry) => !(entry.type === 'image' && entry.id === imageId));
        renderEditorItems();
        debouncedSave();
    }

    function applyEditorItemOrderFromDOM() {
        const chapter = getEditorChapter();
        if (!chapter) {
            return;
        }

        chapter.order = Array.from(dom.editorItems.children).map((element) => ({
            type: element.dataset.type,
            id: Number(element.dataset.id)
        }));

        renderEditorItems();
        debouncedSave();
    }

    /* =========================
       IMAGE VIEW
       ========================= */
    function getActiveChapterImages() {
        return getChapters()
            .filter((chapter) => isChapterActive(chapter.id))
            .flatMap((chapter) => chapter.images);
    }

    function showRandomImage() {
        const images = getActiveChapterImages();

        if (!images.length) {
            dom.imagesCurrent.removeAttribute('src');
            dom.imagesCurrent.style.display = 'none';
            dom.imagesExplanation.textContent = '';
            dom.imagesExplanation.style.display = 'none';
            dom.imagesExplanationPanel.hidden = false;
            return;
        }

        let nextImage = null;
        do {
            nextImage = images[Math.floor(Math.random() * images.length)];
        } while (images.length > 1 && nextImage.id === state.currentImageId);

        state.currentImageId = nextImage.id;
        dom.imagesCurrent.src = nextImage.imagePath;
        dom.imagesCurrent.alt = nextImage.image || 'Random chapter image';
        dom.imagesCurrent.style.display = 'block';

        dom.imagesExplanation.textContent = nextImage.explanation || '';
        dom.imagesExplanation.style.display = state.imagesExplanationVisible ? 'block' : 'none';
        dom.imagesToggleExplanation.querySelector('.toggle-text').textContent = state.imagesExplanationVisible ? 'Show Less' : 'Show More';
    }

    /* =========================
       PRACTICE VIEW
       ========================= */
    function getActivePracticeQuestions() {
        return getChapters()
            .filter((chapter) => isChapterActive(chapter.id))
            .flatMap((chapter) => chapter.questions);
    }

    function shuffleArray(array) {
        for (let index = array.length - 1; index > 0; index -= 1) {
            const randomIndex = Math.floor(Math.random() * (index + 1));
            [array[index], array[randomIndex]] = [array[randomIndex], array[index]];
        }
        return array;
    }

    function getWeightedRandomQuestion(questions, excludedQuestionId = null) {
        const recentIds = state.practice.recentQuestionIds;

        const candidates = questions.filter((question) => {
            return question.id !== excludedQuestionId && !recentIds.includes(question.id);
        });

        const pool = candidates.length ? candidates : questions.filter((question) => question.id !== excludedQuestionId);
        if (!pool.length) {
            return null;
        }

        const totalWeight = pool.reduce((sum, question) => sum + normalizeWeight(question.weight), 0);
        let random = Math.random() * totalWeight;

        for (const question of pool) {
            random -= normalizeWeight(question.weight);
            if (random < 0) {
                return question;
            }
        }

        return pool[pool.length - 1];
    }

    function setPracticeQuestion(question) {
        state.practice.currentQuestionId = question.id;
        state.practice.recentQuestionIds.push(question.id);

        if (state.practice.recentQuestionIds.length > state.practice.recentBufferSize) {
            state.practice.recentQuestionIds.shift();
        }
    }

    function startPractice() {
        state.practice.questions = getActivePracticeQuestions();
        state.practice.currentQuestionId = null;
        state.practice.answered = false;
        state.practice.recentQuestionIds = [];

        dom.practiceSubmit.hidden = false;
        dom.practiceSubmit.textContent = 'SUBMIT';
        dom.practiceSubmit.classList.remove('practice-next');
        dom.practiceSubmit.classList.add('practice-submit');

        if (!state.practice.questions.length) {
            dom.practiceQuestion.textContent = 'No questions available';
            dom.practiceQuestion.classList.add('is-empty');
            dom.practiceAnswers.innerHTML = '';
            dom.practiceSubmit.hidden = true;
            dom.practiceExplanationPanel.hidden = true;
            return;
        }

        shuffleArray(state.practice.questions);
        const firstQuestion = getWeightedRandomQuestion(state.practice.questions);
        if (!firstQuestion) {
            return;
        }

        setPracticeQuestion(firstQuestion);
        renderPracticeQuestion();
    }

    function renderPracticeQuestion() {
        const question = state.practice.questions.find((item) => item.id === state.practice.currentQuestionId);
        if (!question) {
            return;
        }

        state.practice.answered = false;
        dom.practiceQuestion.classList.remove('is-empty');

        dom.practiceQuestion.textContent = question.question;
        dom.practiceAnswers.innerHTML = '';
        dom.practiceExplanationPanel.hidden = true;
        dom.practiceExplanation.style.display = 'none';
        dom.practiceExplanation.textContent = question.explanation || '';
        dom.practiceToggleExplanation.querySelector('.toggle-text').textContent = 'Show More';
        dom.practiceSubmit.textContent = 'SUBMIT';
        dom.practiceSubmit.classList.remove('practice-next');
        dom.practiceSubmit.classList.add('practice-submit');

        question.answers.forEach((answer) => {
            const row = document.createElement('label');
            row.className = 'practice-answer';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.dataset.correct = String(answer.correct);

            const text = document.createElement('span');
            text.textContent = answer.text;

            row.append(checkbox, text);
            dom.practiceAnswers.appendChild(row);
        });
    }

    function scorePracticeQuestion() {
        const question = state.practice.questions.find((item) => item.id === state.practice.currentQuestionId);
        if (!question) {
            return;
        }

        const inputs = Array.from(dom.practiceAnswers.querySelectorAll('input'));
        let correct = true;

        inputs.forEach((input) => {
            const isCorrect = input.dataset.correct === 'true';
            const selected = input.checked;
            const row = input.parentElement;

            if (isCorrect) {
                row.classList.add('correct');
            }
            if (selected && !isCorrect) {
                row.classList.add('wrong');
                correct = false;
            }
            if (!selected && isCorrect) {
                correct = false;
            }
        });

        question.weight = correct
            ? Math.max(1, normalizeWeight(question.weight) - 1)
            : Math.min(5, normalizeWeight(question.weight) + 1);

        debouncedSave();
        state.practice.answered = true;

        dom.practiceSubmit.textContent = 'NEXT';
        dom.practiceSubmit.classList.remove('practice-submit');
        dom.practiceSubmit.classList.add('practice-next');

        dom.practiceExplanationPanel.hidden = false;

        if (!correct) {
            dom.practiceExplanation.style.display = 'block';
            dom.practiceToggleExplanation.querySelector('.toggle-text').textContent = 'Show Less';
        } else {
            dom.practiceExplanation.style.display = 'none';
            dom.practiceToggleExplanation.querySelector('.toggle-text').textContent = 'Show More';
        }
    }

    function goToNextPracticeQuestion() {
        const nextQuestion = getWeightedRandomQuestion(state.practice.questions, state.practice.currentQuestionId);
        if (!nextQuestion) {
            return;
        }

        setPracticeQuestion(nextQuestion);
        renderPracticeQuestion();
    }

    /* =========================
       DRAG / REORDER HELPERS
       ========================= */
    function enableDesktopDrag(element, dragType) {
    element.addEventListener('dragstart', (event) => {
        if (dragType === DRAG_TYPES.CHAPTER && state.currentView !== 'editor') {
            event.preventDefault();
            return;
        }

        const startedFromDeleteButton = event.target.closest('.delete-chapter');
        const startedFromEditableField = event.target.closest('input, textarea, select');

        if (startedFromDeleteButton || startedFromEditableField) {
            event.preventDefault();
            return;
        }

        element.classList.add('dragging');

        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', `${dragType}:${element.dataset.id}`);
        }
    });

    element.addEventListener('dragend', () => {
        element.classList.remove('dragging');
    });
    }

    function enableTouchReorder(element, container, dragType, onDrop) {
        let placeholder = null;
        let startY = 0;
        let startX = 0;
        let draggingElement = null;
        let initialRect = null;

        element.addEventListener('touchstart', (event) => {
            if (dragType === DRAG_TYPES.CHAPTER && state.currentView !== 'editor') {
                return;
            }

            startY = event.touches[0].clientY;
            startX = event.touches[0].clientX;
            initialRect = element.getBoundingClientRect();
            draggingElement = element;

            placeholder = document.createElement(element.tagName.toLowerCase());
            placeholder.className = 'placeholder';
            placeholder.style.height = `${element.offsetHeight}px`;
            placeholder.style.width = `${element.offsetWidth}px`;

            element.after(placeholder);
            document.body.appendChild(element);

            element.style.position = 'fixed';
            element.style.left = `${initialRect.left}px`;
            element.style.top = `${initialRect.top}px`;
            element.style.width = `${initialRect.width}px`;
            element.style.zIndex = '1000';
        }, { passive: true });

        element.addEventListener('touchmove', (event) => {
            if (!draggingElement || !placeholder) {
                return;
            }

            event.preventDefault();
            const touch = event.touches[0];
            const deltaY = touch.clientY - startY;
            const deltaX = touch.clientX - startX;

            draggingElement.style.transform = `translate(${deltaX}px, ${deltaY}px)`;

            const siblings = Array.from(container.children).filter((child) => child !== placeholder && child !== draggingElement);
            let inserted = false;

            for (const sibling of siblings) {
                const rect = sibling.getBoundingClientRect();
                if (touch.clientY < rect.top + rect.height / 2) {
                    container.insertBefore(placeholder, sibling);
                    inserted = true;
                    break;
                }
            }

            if (!inserted) {
                container.appendChild(placeholder);
            }
        }, { passive: false });

        element.addEventListener('touchend', () => {
            if (!draggingElement || !placeholder) {
                return;
            }

            draggingElement.style.position = '';
            draggingElement.style.left = '';
            draggingElement.style.top = '';
            draggingElement.style.width = '';
            draggingElement.style.zIndex = '';
            draggingElement.style.transform = '';

            container.insertBefore(draggingElement, placeholder);
            placeholder.remove();

            placeholder = null;
            draggingElement = null;
            initialRect = null;

            onDrop();
        });
    }

    function getDragAfterElement(container, mouseY, selector) {
        const elements = Array.from(container.querySelectorAll(`${selector}:not(.dragging)`));

        return elements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = mouseY - box.top - box.height / 2;

            if (offset < 0 && offset > closest.offset) {
                return { offset, element: child };
            }
            return closest;
        }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
    }

    dom.chapterList.addEventListener('dragover', (event) => {
        if (state.currentView !== 'editor') {
            return;
        }

        event.preventDefault();
        const dragging = dom.chapterList.querySelector('.dragging');
        if (!dragging) {
            return;
        }

        const afterElement = getDragAfterElement(dom.chapterList, event.clientY, '.chapter-list-item');
        if (!afterElement) {
            dom.chapterList.appendChild(dragging);
        } else {
            dom.chapterList.insertBefore(dragging, afterElement);
        }
    });

    dom.chapterList.addEventListener('drop', () => {
        applyChapterOrderFromDOM();
    });

    dom.editorItems.addEventListener('dragover', (event) => {
        event.preventDefault();

        const dragging = dom.editorItems.querySelector('.dragging');
        if (!dragging) {
            return;
        }

        const afterElement = getDragAfterElement(dom.editorItems, event.clientY, '.editor-item');
        if (!afterElement) {
            dom.editorItems.appendChild(dragging);
        } else {
            dom.editorItems.insertBefore(dragging, afterElement);
        }
    });

    dom.editorItems.addEventListener('drop', () => {
        applyEditorItemOrderFromDOM();
    });

    /* =========================
       EVENT BINDINGS
       ========================= */
    function bindEvents() {
        dom.toggleSidebar.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            dom.sidebar.classList.toggle('expanded');
            updateSidebarDisplay();
        });

        dom.buttonEditor.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            showView('editor');
        });

        dom.buttonImages.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            showView('images');
        });

        dom.buttonPractice.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            showView('practice');
        });

        dom.addChapter.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            addChapter();
        });

        dom.chapterSelect.addEventListener('change', () => {
            const selectedId = Number(dom.chapterSelect.value);
            if (!getChapterById(selectedId)) {
                return;
            }
            state.editorChapterId = selectedId;
            populateChapterDropdown();
        });

        dom.addQuestion.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            const chapter = getEditorChapter();
            if (!chapter) {
                return;
            }

            const question = createQuestion();
            chapter.questions.push(question);
            chapter.order.push({ type: 'question', id: question.id });
            renderEditorItems();
            debouncedSave();
        });

        dom.addImage.addEventListener('click', () => {
    const chapter = getEditorChapter();
    if (!chapter) {
        return;
    }

    dom.imageUploadInput.click();
});

dom.imageUploadInput.addEventListener('change', async () => {
    const chapter = getEditorChapter();
    const file = dom.imageUploadInput.files?.[0];

    if (!chapter || !file) {
        return;
    }

    const formData = new FormData();
    formData.append('image', file);

    try {
        const response = await fetch(`/api/upload-image?chapterId=${chapter.id}`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Failed to upload image');
        }

        const data = await response.json();
        const image = createImageItem(data.path);

        chapter.images.push(image);
        chapter.order.push({ type: 'image', id: image.id });
        renderEditorItems();
        debouncedSave();
    } catch (error) {
        console.error(error);
    } finally {
        dom.imageUploadInput.value = '';
    }
});

        dom.toggleCollapse.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            const chapter = getEditorChapter();
            if (!chapter) {
                return;
            }

            const items = getOrderedItems(chapter);
            const anyCollapsed = items.some((item) => item.collapsed);
            items.forEach((item) => {
                item.collapsed = !anyCollapsed;
            });

            renderEditorItems();
            debouncedSave();
        });

        dom.imagesNext.addEventListener('click', showRandomImage);

        dom.imagesToggleExplanation.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            state.imagesExplanationVisible = !state.imagesExplanationVisible;
            dom.imagesExplanation.style.display = state.imagesExplanationVisible ? 'block' : 'none';
            dom.imagesToggleExplanation.querySelector('.toggle-text').textContent = state.imagesExplanationVisible ? 'Show Less' : 'Show More';
        });

        dom.practiceSubmit.addEventListener('click', () => {
            if (!state.practice.answered) {
                scorePracticeQuestion();
            } else {
                goToNextPracticeQuestion();
            }
        });

        dom.practiceToggleExplanation.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            const currentlyVisible = dom.practiceExplanation.style.display === 'block';
            dom.practiceExplanation.style.display = currentlyVisible ? 'none' : 'block';
            dom.practiceToggleExplanation.querySelector('.toggle-text').textContent = currentlyVisible ? 'Show More' : 'Show Less';
        });

        [dom.inputQuestions, dom.inputTime].forEach((input) => {
            input.addEventListener('input', () => {
                input.value = input.value.replace(/[^0-9]/g, '');
            });
        });

        document.addEventListener('keydown', (event) => {
            const tagName = document.activeElement?.tagName?.toLowerCase();
            if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
                return;
            }

            if (state.currentView === 'images' && (event.key === 'ArrowRight' || event.key === ' ')) {
                event.preventDefault();
                showRandomImage();
            }
        });
    }

    /* =========================
       INITIALIZATION
       ========================= */
    async function init() {
        bindEvents();

        try {
            await loadDatabase();
        } catch (error) {
            console.error(error);
            state.database = createEmptyDatabase();
        }

        renderChapterList();
        populateChapterDropdown();
        showView('practice');
    }

    init();
})();
