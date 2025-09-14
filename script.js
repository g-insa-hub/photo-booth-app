class PhotoBoothApp {
    constructor() {
        this.currentPage = 1;
        this.video = null;
        this.canvas = null;
        this.overlay = null;
        this.model = null;
        this.selectedBackground = 0;
        this.capturedPhotos = {
            photo1: null,
            photo2: null
        };
        this.isCapturing = false;

        this.init();
    }

    async init() {
        this.setTodayDate();
        this.setupEventListeners();
        await this.initializeCamera();
        await this.loadFaceDetectionModel();
        this.setupBackgroundSelection();
    }

    setTodayDate() {
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('today-date').value = today;
    }

    setupEventListeners() {
        const captureBtn = document.getElementById('capture-btn');
        const printBtn = document.getElementById('print-btn');
        const finalPrintBtn = document.getElementById('final-print-btn');

        captureBtn.addEventListener('click', () => this.startCountdown());
        finalPrintBtn.addEventListener('click', () => this.printSelectedPhoto());

        printBtn.disabled = true;
    }

    setupBackgroundSelection() {
        const bgButtons = document.querySelectorAll('.bg-btn');
        bgButtons.forEach((btn, index) => {
            btn.addEventListener('click', () => {
                bgButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.selectedBackground = index;
            });
        });
    }

    async initializeCamera() {
        try {
            this.video = document.getElementById('video');
            this.overlay = document.getElementById('overlay');

            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1080 },
                    height: { ideal: 1920 },
                    facingMode: 'user'
                }
            });

            this.video.srcObject = stream;
            this.video.addEventListener('loadedmetadata', () => {
                this.startFaceDetection();
            });

        } catch (error) {
            console.error('카메라 접근 오류:', error);
            alert('카메라에 접근할 수 없습니다. 카메라 권한을 허용해주세요.');
        }
    }

    async loadFaceDetectionModel() {
        try {
            await tf.ready();
            this.model = await faceLandmarksDetection.load(
                faceLandmarksDetection.SupportedPackages.mediapipeFacemesh,
                { maxFaces: 5 }
            );
            console.log('얼굴 인식 모델 로드 완료');
        } catch (error) {
            console.error('모델 로드 오류:', error);
        }
    }

    async startFaceDetection() {
        if (!this.model || !this.video) return;

        const detectFaces = async () => {
            if (this.video.readyState === 4) {
                const predictions = await this.model.estimateFaces({
                    input: this.video,
                    returnTensors: false,
                    flipHorizontal: false,
                });

                this.drawOverlay(predictions);
            }
            requestAnimationFrame(detectFaces);
        };

        detectFaces();
    }

    drawOverlay(faces) {
        if (!this.overlay) return;

        const ctx = this.overlay.getContext('2d');
        ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);

        faces.forEach(face => {
            this.applyFilter(ctx, face, this.selectedBackground);
        });
    }

    applyFilter(ctx, face, filterType) {
        if (!face.scaledMesh) return;

        const landmarks = face.scaledMesh;

        // 얼굴의 주요 포인트들
        const noseTip = landmarks[1];
        const leftEye = landmarks[33];
        const rightEye = landmarks[263];
        const leftCheek = landmarks[116];
        const rightCheek = landmarks[345];
        const forehead = landmarks[10];

        ctx.save();

        switch (filterType) {
            case 0: // 꼬깔콘
                this.drawPartyHat(ctx, forehead, noseTip);
                break;
            case 1: // 부끄럼 표시
                this.drawBlush(ctx, leftCheek, rightCheek);
                break;
            case 2: // 왕관
                this.drawCrown(ctx, forehead, leftEye, rightEye);
                break;
            case 3: // 마스크
                this.drawMask(ctx, leftEye, rightEye, noseTip);
                break;
        }

        ctx.restore();
    }

    drawPartyHat(ctx, forehead, noseTip) {
        const centerX = forehead[0];
        const centerY = forehead[1] - 100;
        const hatHeight = 150;
        const hatWidth = 100;

        // 꼬깔콘 그리기
        ctx.fillStyle = '#ff6b6b';
        ctx.beginPath();
        ctx.moveTo(centerX, centerY - hatHeight);
        ctx.lineTo(centerX - hatWidth/2, centerY);
        ctx.lineTo(centerX + hatWidth/2, centerY);
        ctx.closePath();
        ctx.fill();

        // 폼폼 그리기
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(centerX, centerY - hatHeight, 20, 0, Math.PI * 2);
        ctx.fill();

        // 패턴
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc(centerX - 30 + i * 30, centerY - 50 + i * 25, 8, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    drawBlush(ctx, leftCheek, rightCheek) {
        ctx.fillStyle = 'rgba(255, 182, 193, 0.6)';

        // 왼쪽 볼
        ctx.beginPath();
        ctx.ellipse(leftCheek[0] - 30, leftCheek[1], 40, 25, 0, 0, Math.PI * 2);
        ctx.fill();

        // 오른쪽 볼
        ctx.beginPath();
        ctx.ellipse(rightCheek[0] + 30, rightCheek[1], 40, 25, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    drawCrown(ctx, forehead, leftEye, rightEye) {
        const centerX = forehead[0];
        const centerY = forehead[1] - 80;
        const crownWidth = Math.abs(rightEye[0] - leftEye[0]) + 60;

        // 왕관 베이스
        ctx.fillStyle = '#ffd700';
        ctx.fillRect(centerX - crownWidth/2, centerY, crownWidth, 40);

        // 왕관 뾰족한 부분들
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
            const x = centerX - crownWidth/2 + (crownWidth/4) * i;
            const height = i === 2 ? 60 : 40; // 가운데가 가장 높음
            ctx.moveTo(x, centerY);
            ctx.lineTo(x + crownWidth/8, centerY - height);
            ctx.lineTo(x + crownWidth/4, centerY);
        }
        ctx.fill();

        // 보석들
        ctx.fillStyle = '#ff0000';
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc(centerX - 40 + i * 40, centerY + 20, 8, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    drawMask(ctx, leftEye, rightEye, noseTip) {
        const centerX = (leftEye[0] + rightEye[0]) / 2;
        const centerY = (leftEye[1] + rightEye[1]) / 2;
        const maskWidth = Math.abs(rightEye[0] - leftEye[0]) + 100;
        const maskHeight = 60;

        // 마스크 배경
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, maskWidth/2, maskHeight/2, 0, 0, Math.PI * 2);
        ctx.fill();

        // 마스크 테두리
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 4;
        ctx.stroke();

        // 눈 구멍
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(leftEye[0], leftEye[1], 25, 20, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(rightEye[0], rightEye[1], 25, 20, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    async startCountdown() {
        if (this.isCapturing) return;

        this.isCapturing = true;
        const countdownEl = document.getElementById('countdown');

        for (let i = 3; i > 0; i--) {
            countdownEl.textContent = i;
            countdownEl.classList.add('show');

            if (i === 1) {
                // 1초 전 사진 캡처
                setTimeout(() => {
                    this.capturePhoto('photo1');
                }, 500);
            }

            await new Promise(resolve => setTimeout(resolve, 1000));
            countdownEl.classList.remove('show');
        }

        // 최종 사진 캡처
        this.capturePhoto('photo2');

        // 인쇄 버튼 활성화
        document.getElementById('print-btn').disabled = false;

        this.isCapturing = false;
    }

    capturePhoto(photoId) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        canvas.width = 1080;
        canvas.height = 1920;

        // 비디오 그리기 (좌우반전)
        ctx.scale(-1, 1);
        ctx.drawImage(this.video, -canvas.width, 0, canvas.width, canvas.height);
        ctx.scale(-1, 1);

        // 오버레이 그리기
        ctx.drawImage(this.overlay, 0, 0);

        // 데이터 URL로 저장
        this.capturedPhotos[photoId] = canvas.toDataURL('image/png');

        console.log(`${photoId} 캡처 완료`);
    }

    printSelectedPhoto() {
        const selectedRadio = document.querySelector('input[name="photo-select"]:checked');
        if (!selectedRadio) {
            alert('인쇄할 사진을 선택해주세요.');
            return;
        }

        const selectedPhoto = this.capturedPhotos[selectedRadio.value];
        if (!selectedPhoto) {
            alert('선택한 사진이 없습니다.');
            return;
        }

        // 새 창에서 인쇄
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
                <head>
                    <title>사진 인쇄</title>
                    <style>
                        @page {
                            size: 54mm 86mm;
                            margin: 0;
                        }
                        body {
                            margin: 0;
                            padding: 0;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            min-height: 100vh;
                        }
                        img {
                            width: 54mm;
                            height: 86mm;
                            object-fit: cover;
                        }
                    </style>
                </head>
                <body>
                    <img src="${selectedPhoto}" alt="인쇄용 사진" />
                </body>
            </html>
        `);

        printWindow.document.close();

        // 이미지 로드 후 인쇄
        setTimeout(() => {
            printWindow.print();
        }, 1000);
    }
}

// 페이지 네비게이션 함수
function goToPage(pageNum) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });

    document.getElementById(`page${pageNum}`).classList.add('active');

    if (pageNum === 3) {
        displayCapturedPhotos();
    }
}

function displayCapturedPhotos() {
    if (window.photoBoothApp) {
        const photo1Canvas = document.getElementById('photo1');
        const photo2Canvas = document.getElementById('photo2');

        if (window.photoBoothApp.capturedPhotos.photo1) {
            const ctx1 = photo1Canvas.getContext('2d');
            const img1 = new Image();
            img1.onload = () => {
                ctx1.drawImage(img1, 0, 0, photo1Canvas.width, photo1Canvas.height);
            };
            img1.src = window.photoBoothApp.capturedPhotos.photo1;
        }

        if (window.photoBoothApp.capturedPhotos.photo2) {
            const ctx2 = photo2Canvas.getContext('2d');
            const img2 = new Image();
            img2.onload = () => {
                ctx2.drawImage(img2, 0, 0, photo2Canvas.width, photo2Canvas.height);
            };
            img2.src = window.photoBoothApp.capturedPhotos.photo2;
        }
    }
}

// 앱 초기화
document.addEventListener('DOMContentLoaded', () => {
    window.photoBoothApp = new PhotoBoothApp();
});