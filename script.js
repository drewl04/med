// ========================== ELEMENTS & STATE ==========================
const sidebar = document.getElementById('sidebar');
const toggleBtn = document.getElementById('button-toggle-sidebar');

const middleSidebar = sidebar.querySelector('nav > div:nth-child(2)');
const bottomSidebar = sidebar.querySelector('nav > div:nth-child(3)');

const addChapterBtn = document.getElementById('button-add-chapter');
const chapterList = middleSidebar.querySelector('ul');

const btnEditor   = document.getElementById('button-enter-editor');
const btnImages   = document.getElementById('button-enter-images');
const btnPractice = document.getElementById('button-enter-practice');

const viewEditor   = document.getElementById('view-editor');
const viewImages   = document.getElementById('view-images');
const viewPractice = document.getElementById('view-practice');

const inputQuestions = document.getElementById('input-questions');
const inputTime = document.getElementById('input-time');

const chapterSelect = document.getElementById('editor-chapter-select');

const btnAddQuestion = document.getElementById('button-add-question');
const btnAddImage = document.getElementById('button-add-image');
const btnToggleCollapse = document.getElementById("button-toggle-collapse");
const editorItems = document.getElementById('editor-items');

let chapters = []; // { id, name, questions }
let chapterCount = 0;
let chapterIdCounter = 1;

let editorChapter = null;
let currentView = viewEditor;

let saveTimeout = null;

function debouncedSave(){

    clearTimeout(saveTimeout);

    saveTimeout = setTimeout(()=>{
        saveChaptersToServer();
    }, 400);

}

// ========================== IMAGES VIEW ==========================
const imagesDisplay = document.getElementById('images-current'); // <img> inside viewImages
const btnImagesNext = document.getElementById('images-next');    // Next button

let currentImage = null; // track current image to avoid repeats

// ========================== UTILITIES ==========================
function isMobile() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

function getCheckedChaptersImages() {
    // Collect images only from chapters whose buttons are active (checked)
    const checkedChapters = chapters.filter(ch => {
        const li = chapterList.querySelector(`li[data-id="${ch.id}"]`);
        if (!li) return false;
        const btn = li.querySelector('.chapter-button');
        return btn.classList.contains('active');
    });

    let images = [];
    checkedChapters.forEach(ch => {
        ch.questions.forEach(q => {
            if (q.imagePath) images.push(q.imagePath);
        });
    });

    return images;
}

function showRandomImage() {
    const images = getCheckedChaptersImages();
    if (!images.length) {
        imagesDisplay.style.display = 'none'; // no images available
        return;
    }

    

    // pick a random image different from current
    let nextImage;
    do {
        nextImage = images[Math.floor(Math.random() * images.length)];
    } while (nextImage === currentImage && images.length > 1);

    currentImage = nextImage;
    imagesDisplay.src = currentImage;
    imagesDisplay.style.display = 'block'; 
}

btnImagesNext.addEventListener('click', showRandomImage);

[inputQuestions, inputTime].forEach(input => {
    input.addEventListener('input', () => {
        input.value = input.value.replace(/[^0-9]/g, '');
    });
});



// ========================== VIEW MANAGEMENT ==========================
function showView(view) {
    [viewEditor, viewImages, viewPractice].forEach(v => v.style.display = 'none');
    view.style.display = 'block';

    if (view === viewImages) {
    currentImage = null; // reset
    showRandomImage();    // show a random image immediately
}

    [btnEditor, btnImages, btnPractice].forEach(btn => btn.classList.remove('active'));
    if (view === viewEditor) btnEditor.classList.add('active');
    else if (view === viewImages) btnImages.classList.add('active');
    else btnPractice.classList.add('active');

    currentView = view;
    updateSidebarDisplay();
}

btnEditor.addEventListener('click', () => showView(viewEditor));
btnImages.addEventListener('click', () => showView(viewImages));
btnPractice.addEventListener('click', () => showView(viewPractice));

// ========================== SIDEBAR DISPLAY ==========================
toggleBtn.addEventListener('click', () => {
    sidebar.classList.toggle('expanded');
    updateSidebarDisplay();
});

function updateSidebarDisplay() {
    const expanded = sidebar.classList.contains('expanded');

    if (!expanded) {
        middleSidebar.style.display = '';
        bottomSidebar.style.display = '';
        addChapterBtn.style.display = '';
        updateChapterControls();
        return;
    }

    if (currentView === viewEditor) {
        middleSidebar.style.display = 'flex';
        bottomSidebar.style.display = 'flex';
        addChapterBtn.style.display = 'block';
    } else {
        middleSidebar.style.display = 'flex';
        bottomSidebar.style.display = 'none';
        addChapterBtn.style.display = 'none';
    }

    updateChapterControls();
}

function updateChapterControls() {
    const showDelete = currentView === viewEditor;
    chapterList.querySelectorAll('.delete-chapter')
        .forEach(btn => btn.style.display = showDelete ? 'flex' : 'none');
}

// ========================== CHAPTER UI ==========================
function createChapterItem(chapter) {

    const li = document.createElement('li');
    li.dataset.id = chapter.id;
    li.draggable = true;
    li.style.display = 'flex';
    li.style.alignItems = 'center';
    li.style.gap = '0.5rem';

    // delete button
    const deleteBtn = document.createElement('span');
    deleteBtn.className = 'delete-chapter';
    deleteBtn.textContent = '✖';
    deleteBtn.addEventListener('click', () =>
        handleDeleteChapter(li, chapter.id)
    );

    // chapter button
    const chapterBtn = document.createElement('button');
    chapterBtn.className = 'chapter-button';

    const check = document.createElement('span');
    check.className = 'checkmark';
    check.textContent = '✔';
    chapterBtn.appendChild(check);

    const spanText = document.createElement('span');
    spanText.textContent = chapter.name;
    chapterBtn.appendChild(spanText);

    chapterBtn.addEventListener('click', () => {
        const active = chapterBtn.classList.toggle('active');
        check.style.visibility = active ? 'visible' : 'hidden';
        chapterBtn.style.background =
            active ? 'rgb(0,118,255)' : 'transparent';
    });

    // rename
    spanText.addEventListener('dblclick', e => {
        if (currentView !== viewEditor) return;
        e.stopPropagation();

        const input = document.createElement('input');
        input.value = spanText.textContent;

        input.style.cssText = `
            background: rgb(30,34,79);
            color:white;
            border:2px solid rgb(47,53,124);
            border-radius:0.5rem;
            padding:0.1rem 0.35rem;
        `;

        spanText.replaceWith(input);
        input.focus();
        input.select();

        function saveName() {
            chapter.name = input.value || chapter.name;
            spanText.textContent = chapter.name;
            input.replaceWith(spanText);
            populateChapterDropdown();
            debouncedSave();
        }

        input.addEventListener('blur', saveName);
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') saveName();
        });
    });

    li.append(deleteBtn, chapterBtn);

    // drag desktop
    li.addEventListener('dragstart', e => {
        if (currentView !== viewEditor) { e.preventDefault(); return; }
        li.classList.add('dragging');
        try {
            e.dataTransfer.setData('text/plain','');
            e.dataTransfer.effectAllowed='move';
        } catch {}
    });

    li.addEventListener('dragend', () => {
        li.classList.remove('dragging');
        reorderChaptersFromDOM();
        debouncedSave();
        populateChapterDropdown();
    });

    makeMobileDraggable(li);
    return li;
}

// ========================== DELETE ==========================
function handleDeleteChapter(li, id) {
    chapters = chapters.filter(ch => ch.id !== id);
    li.remove();

    if (editorChapter && editorChapter.id === id)
        editorChapter = chapters[0] || null;

    populateChapterDropdown();
    debouncedSave();
}

// ========================== DRAG ==========================
function reorderChaptersFromDOM() {
    const ids = [...chapterList.querySelectorAll('li')]
        .map(li => Number(li.dataset.id));

    chapters.sort((a,b)=>ids.indexOf(a.id)-ids.indexOf(b.id));
}

function getDragAfterElement(container, mouseY) {
    const elements=[...container.querySelectorAll('li:not(.dragging)')];
    return elements.reduce((closest,child)=>{
        const box=child.getBoundingClientRect();
        const offset=mouseY-box.top-box.height/2;
        if(offset<0&&offset>closest.offset)
            return{offset,element:child};
        return closest;
    },{offset:Number.NEGATIVE_INFINITY}).element;
}

function getDragAfterElementEditor(container, y){

    const draggableElements = [...container.querySelectorAll(".editor-item:not(.dragging)")];

    return draggableElements.reduce((closest, child)=>{

        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;

        if(offset < 0 && offset > closest.offset){
            return {offset: offset, element: child};
        }else{
            return closest;
        }

    }, {offset: Number.NEGATIVE_INFINITY}).element;

}

chapterList.addEventListener('dragover',e=>{
    if(currentView!==viewEditor||isMobile())return;
    e.preventDefault();

    const after=getDragAfterElement(chapterList,e.clientY);
    const dragging=chapterList.querySelector('.dragging');
    if(!dragging)return;

    if(!after)chapterList.appendChild(dragging);
    else chapterList.insertBefore(dragging,after);
});

// ========================== MOBILE DRAG ==========================
function makeMobileDraggable(li){
    if(!isMobile())return;

    let placeholder=null,startY=0,draggingWrapper=null;

    li.addEventListener('touchstart',e=>{
        if(currentView!==viewEditor)return;
        startY=e.touches[0].clientY;

        placeholder=document.createElement('li');
        placeholder.className='placeholder';
        placeholder.style.height=li.offsetHeight+'px';
        li.after(placeholder);

        draggingWrapper=li;
        const rect=li.getBoundingClientRect();
        draggingWrapper.style.cssText=`
            position:absolute;
            z-index:1000;
            width:${rect.width}px;
            left:${rect.left}px;
            top:${rect.top}px;
        `;
        document.body.appendChild(draggingWrapper);
    },{passive:true});

    li.addEventListener('touchmove',e=>{
        if(!placeholder)return;
        e.preventDefault();

        const offset=e.touches[0].clientY-startY;
        draggingWrapper.style.transform=`translateY(${offset}px)`;

        const siblings=[...chapterList.querySelectorAll('li')]
            .filter(n=>n!==placeholder&&n!==draggingWrapper);

        for(const s of siblings){
            const r=s.getBoundingClientRect();
            if(e.touches[0].clientY<r.top+r.height/2){
                chapterList.insertBefore(placeholder,s);
                return;
            }
        }
        chapterList.appendChild(placeholder);
    },{passive:false});

    li.addEventListener('touchend',()=>{
        if(!placeholder)return;
        draggingWrapper.style.cssText='';
        chapterList.insertBefore(draggingWrapper,placeholder);
        placeholder.remove();
        placeholder=null;
        reorderChaptersFromDOM();
        debouncedSave();
        populateChapterDropdown();
    });
}

// ========================== SERVER ==========================
async function loadChaptersFromServer(){
    try{
        const res=await fetch('/api/chapters');
        const data=await res.json();

        chapterList.innerHTML='';
        chapters=[];
        chapterCount=0;

        data.forEach(ch => {

    const chapter = {
        id: ch.id ?? chapterIdCounter++,
        name: ch.name,
        questions: ch.questions ?? []
    };

    chapterCount++;
    chapterIdCounter = Math.max(chapterIdCounter, chapter.id + 1);

    chapters.push(chapter);
    chapterList.appendChild(createChapterItem(chapter));

});

        editorChapter=chapters[0]||null;
        populateChapterDropdown();
    }catch(err){
        console.error(err);
    }
}

async function saveChaptersToServer(){
    
    try{
        await fetch('/api/chapters',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(chapters)
});
    }catch(err){console.error(err);}
}

// ========================== ADD CHAPTER ==========================
addChapterBtn.addEventListener('click',()=>{
    chapterCount++;

    const chapter={
        id:chapterIdCounter++,
        name:'chapter '+chapterCount,
        questions:[]
    };

    chapters.push(chapter);
    chapterList.appendChild(createChapterItem(chapter));

    if(!editorChapter) editorChapter=chapter;

    populateChapterDropdown();
    debouncedSave();
});

// ========================== DROPDOWN ==========================
function populateChapterDropdown() {

    chapterSelect.innerHTML = '';

    chapters.forEach(ch => {
        const option = document.createElement('option');

        option.value = ch.id;
        option.textContent = ch.name;

        if (editorChapter && ch.id === editorChapter.id) {
            option.classList.add('active-chapter-option');
        }

        chapterSelect.appendChild(option);
    });

    if (editorChapter) {
        chapterSelect.value = String(editorChapter.id);
    }

    renderQuestions();
}

chapterSelect.addEventListener('change', () => {

    const id = Number(chapterSelect.value);

    //  block selecting current chapter
    if (editorChapter && id === editorChapter.id) {

        // immediately revert selection
        requestAnimationFrame(() => {
            chapterSelect.value = String(editorChapter.id);
        });

        return;
    }

    const found = chapters.find(ch => ch.id === id);
    if (!found) return;

    editorChapter = found;

    populateChapterDropdown();
});

// ========================== QUESTIONS ==========================
function updateCollapseButton(){

    if(!editorChapter) return;

    const anyCollapsed = editorChapter.questions.some(q => q.collapsed);

    if(anyCollapsed){
        btnToggleCollapse.textContent = "expand all";
    }else{
        btnToggleCollapse.textContent = "collapse all";
    }

}

function renderQuestions(){

    editorItems.innerHTML = '';

    if(!editorChapter) return;

    editorChapter.questions.forEach((q, index) => {

        const component = createQuestionComponent(q, index);
        editorItems.appendChild(component);

    });

    updateCollapseButton();
}


function createQuestionComponent(q, index){

    const box = document.createElement("div");
    box.draggable = true;
    box.className = "editor-item";
    box.questionData = q;

    /* ---------- IMAGE ITEM ---------- */
    if(q.image !== undefined){

        const header = document.createElement("div");
        header.className = "question-header";
        header.style.cursor = "pointer";

        const arrow = document.createElement("span");
        arrow.textContent = q.collapsed ? "▶" : "▼";
        arrow.className = "collapse-arrow";

        const number = document.createElement("span");
        number.className = "question-number";
        number.textContent = "#" + (index + 1);

        const imageInput = document.createElement("input");
        imageInput.placeholder = "Image title";
        imageInput.value = q.image; // EMPTY by default

        imageInput.addEventListener("input", () => {
            q.image = imageInput.value;
            debouncedSave();
        });

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "delete-question";
        deleteBtn.textContent = "🗑";

        deleteBtn.onclick = async () => {

    const path = q.imagePath;

    if(path){
        await fetch('/api/delete-image', {
            method: 'DELETE',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ path })
        });
    }

    editorChapter.questions.splice(index,1);
    renderQuestions();
    debouncedSave();
};

        header.append(arrow, number, imageInput, deleteBtn);

        const content = document.createElement("div");
        content.className = "question-content";

        const img = document.createElement("img");
        img.src = q.imagePath; // image shows immediately
        img.style.maxWidth = "100%";
        img.style.borderRadius = "0.5rem";
        img.style.marginBottom = "0.5rem";
        img.className = "image-added";

        const explanation = document.createElement("textarea");
        explanation.className = "explanation-area";
        explanation.placeholder = "Explanation / caption (optional)";
        explanation.value = q.explanation;

        explanation.addEventListener("input", () => {
            q.explanation = explanation.value;
            debouncedSave();
        });

        content.append(img, explanation);

        box.append(header, content);

        if(q.collapsed){
            content.style.display = "none";
        }

        header.addEventListener("click", (e) => {
            if(e.target === deleteBtn || e.target === imageInput) return;
            q.collapsed = !q.collapsed;
            content.style.display = q.collapsed ? "none" : "block";
            arrow.textContent = q.collapsed ? "▶" : "▼";
            debouncedSave();
        });

        return box;
    }

    /* ---------- HEADER (QUESTION ITEM) ---------- */
    const header = document.createElement("div");
    header.className = "question-header";

    const arrow = document.createElement("span");
    arrow.textContent = q.collapsed ? "▶" : "▼";
    arrow.className = "collapse-arrow";

    const number = document.createElement("span");
    number.className = "question-number";
    number.textContent = "#" + (index + 1);

    const questionInput = document.createElement("input");
    questionInput.placeholder = "Question title";
    questionInput.value = q.question;

    questionInput.addEventListener("input", () => {
        q.question = questionInput.value;
        debouncedSave();
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-question";
    deleteBtn.textContent = "🗑";

    deleteBtn.onclick = () => {
        editorChapter.questions.splice(index,1);
        renderQuestions();
        debouncedSave();
    };

    header.append(arrow, number, questionInput, deleteBtn);
    header.style.cursor = "pointer";

    /* ---------- ANSWERS ---------- */
    const answersWrapper = document.createElement("div");
    answersWrapper.className = "answers";

    q.answers.forEach((a,i)=>{
        const row = document.createElement("div");
        row.className = "answer-row";

        const indicator = document.createElement("div");
        indicator.className = "answer-indicator";
        if(a.correct) indicator.classList.add("correct");

        const input = document.createElement("input");
        input.placeholder = "answer " + (i+1);
        input.value = a.text;

        input.addEventListener("input", () => {
            a.text = input.value;
            debouncedSave();
        });

        row.addEventListener("click", (e) => {
            if(e.target === input) return;
            a.correct = !a.correct;
            indicator.classList.toggle("correct");
            debouncedSave();
        });

        row.append(indicator,input);
        answersWrapper.appendChild(row);
    });

    /* ---------- EXPLANATION ---------- */
    const explanation = document.createElement("textarea");
    explanation.className = "explanation-area";
    explanation.placeholder = "Explanation (optional)";
    explanation.value = q.explanation;

    explanation.addEventListener("input", () => {
        q.explanation = explanation.value;
        debouncedSave();
    });

    /* ---------- APPEND ---------- */
    const content = document.createElement("div");
    content.className = "question-content";
    content.append(answersWrapper, explanation);

    box.append(header, content);

    if(q.collapsed){
        content.style.display = "none";
    }

    /* ---------- HEADER TOGGLE ---------- */
    header.addEventListener("click", (e) => {
        if(e.target === deleteBtn || e.target === questionInput) return;
        q.collapsed = !q.collapsed;
        content.style.display = q.collapsed ? "none" : "block";
        arrow.textContent = q.collapsed ? "▶" : "▼";
        debouncedSave();
    });

    /* ---------- DRAG ---------- */
    box.addEventListener("dragstart", () => {
        box.classList.add("dragging");
    });

    box.addEventListener("dragend", () => {
        box.classList.remove("dragging");
        const items = [...editorItems.children];
        editorChapter.questions = items.map(item => item.questionData);
        renderQuestions();
        debouncedSave();
    });

    return box;
}

editorItems.addEventListener("dragover", e => {

    e.preventDefault();

    const dragging = document.querySelector(".dragging");
    if(!dragging) return;

    const afterElement = getDragAfterElementEditor(editorItems, e.clientY);

    if(afterElement == null){
        editorItems.appendChild(dragging);
    }else{
        editorItems.insertBefore(dragging, afterElement);
    }

});

// ========================== INIT ==========================
showView(viewEditor);
loadChaptersFromServer();




btnAddQuestion.addEventListener('click', () => {

    if (!editorChapter) return;

    const question = {
        question: "",
        answers: [
            { text:"", correct:false },
            { text:"", correct:false },
            { text:"", correct:false },
            { text:"", correct:false },
            { text:"", correct:false }
        ],
        explanation: "",
        collapsed: false
    };

    editorChapter.questions.push(question);

    renderQuestions();

    debouncedSave();

});


btnToggleCollapse.addEventListener("click", ()=>{

    if(!editorChapter) return;

    const anyCollapsed = editorChapter.questions.some(q => q.collapsed);

    editorChapter.questions.forEach(q=>{
        q.collapsed = !anyCollapsed;
    });

    renderQuestions();
    debouncedSave();

});

btnAddImage.addEventListener('click', async () => {

    if (!editorChapter) return;

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';

    fileInput.onchange = async () => {

        const file = fileInput.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append("image", file);
        

        const res = await fetch('/api/upload-image?chapterId=' + editorChapter.id, {
    method: 'POST',
    body: formData
});

        const data = await res.json();

        const imageItem = {
            image: "",
            imagePath: data.path, // permanent path
            explanation: "",
            collapsed: false
        };

        editorChapter.questions.push(imageItem);

        renderQuestions();
        debouncedSave();
    };

    fileInput.click();
});