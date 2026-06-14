document.addEventListener("DOMContentLoaded", () => {
    
    // --- Scroll Reveal Animations ---
    const revealElements = document.querySelectorAll('.reveal');

    const revealOnScroll = () => {
        const windowHeight = window.innerHeight;
        const elementVisible = 100; // Trigger when 100px from bottom

        revealElements.forEach(el => {
            const elementTop = el.getBoundingClientRect().top;
            if (elementTop < windowHeight - elementVisible) {
                el.classList.add('active');
            }
        });
    };

    // Initial check on load
    revealOnScroll();
    
    // Check on scroll
    window.addEventListener('scroll', revealOnScroll);


    // --- Sticky Navbar Shadow ---
    const navbar = document.querySelector('.navbar');
    
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.style.boxShadow = "0 4px 20px rgba(0,0,0,0.05)";
            navbar.style.borderBottom = "none";
        } else {
            navbar.style.boxShadow = "none";
            navbar.style.borderBottom = "1px solid var(--border-color)";
        }
    });

    // --- Smart Smooth Scrolling for Anchor Links & Cross-Page Hashes ---
    const smoothScrollTo = (targetSelector) => {
        const targetElement = document.querySelector(targetSelector);
        if (targetElement) {
            window.scrollTo({
                top: targetElement.offsetTop - 80, // Offset for sticky navbar
                behavior: 'smooth'
            });
            return true;
        }
        return false;
    };

    // Handle clicks on any link containing a hash
    document.querySelectorAll('a[href*="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const url = new URL(this.href, window.location.href);
            // Check if link points to the current page (same origin & pathname)
            if (url.origin === window.location.origin && url.pathname === window.location.pathname) {
                if (url.hash) {
                    e.preventDefault();
                    if (smoothScrollTo(url.hash)) {
                        history.pushState(null, null, url.hash);
                    }
                }
            }
        });
    });

    // Smooth scroll to target section if URL hash is present on initial load
    if (window.location.hash) {
        // Wait slightly for layouts/images to render to calculate precise top offset
        window.addEventListener('load', () => {
            setTimeout(() => {
                smoothScrollTo(window.location.hash);
            }, 150);
        });
    }

    // --- FAQ Accordion Interactive Toggles ---
    const faqItems = document.querySelectorAll('.faq-accordion .faq-item');
    faqItems.forEach(item => {
        const questionBtn = item.querySelector('.faq-question');
        const answer = item.querySelector('.faq-answer');
        
        if (questionBtn && answer) {
            questionBtn.addEventListener('click', () => {
                const isActive = item.classList.contains('active');
                
                // Close all other open accordion items
                faqItems.forEach(i => {
                    if (i !== item) {
                        i.classList.remove('active');
                        const otherAnswer = i.querySelector('.faq-answer');
                        if (otherAnswer) otherAnswer.style.maxHeight = null;
                    }
                });
                
                // Toggle clicked item
                if (isActive) {
                    item.classList.remove('active');
                    answer.style.maxHeight = null;
                } else {
                    item.classList.add('active');
                    answer.style.maxHeight = answer.scrollHeight + "px";
                }
            });
        }
    });

    // --- Mobile Hamburger Menu Overlay Toggle ---
    const navToggle = document.querySelector('.nav-toggle');
    const mobileMenu = document.querySelector('.mobile-menu');
    
    if (navToggle && mobileMenu) {
        navToggle.addEventListener('click', () => {
            navToggle.classList.toggle('open');
            mobileMenu.classList.toggle('open');
        });
        
        // Close menu when clicking on any links
        mobileMenu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navToggle.classList.remove('open');
                mobileMenu.classList.remove('open');
            });
        });
    }

    // --- Step 1 Database Sheets Mockup Tab Switcher ---
    const sheetsTabs = document.querySelectorAll('.sheets-tabs .sheets-tab');
    const sheetsContainers = document.querySelectorAll('.sheets-grid-container');
    
    sheetsTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.getAttribute('data-tab');
            
            // Toggle active classes on tabs
            sheetsTabs.forEach(t => {
                if (t === tab) {
                    t.classList.remove('inactive');
                    t.classList.add('active');
                } else {
                    t.classList.remove('active');
                    t.classList.add('inactive');
                }
            });
            
            // Show/Hide grids
            sheetsContainers.forEach(container => {
                if (container.id === `tab-${targetTab}`) {
                    container.style.display = 'block';
                } else {
                    container.style.display = 'none';
                }
            });
        });
    });

    // --- Hero Chat Mockup Interactive Simulation Playground ---
    const chatBody = document.getElementById('hero-chat-body');
    const chatChips = document.querySelectorAll('.chat-interactive-chips .chip-btn');
    const latencyIndicator = document.getElementById('chat-latency-indicator');
    
    let isSimulatorAnimating = false;
    
    const simulations = {
        stock: {
            user: "bhaiya black color er L size hobe? price koto?",
            bot: "জি ভাইয়া, ব্ল্যাক কালার L সাইজ স্টকে এভেইলেবল আছে! এটার প্রাইস ১২০০ টাকা। ইনবক্সে আপনার নাম ও ঠিকানা দিলে অর্ডার কনফার্ম করে নিব।",
            latency: '<i class="fa-solid fa-bolt"></i> Responded instantly with personalized greeting (0.4ms)'
        },
        discount: {
            user: "kisu discount hobe bhaiya?",
            bot: "যেহেতু আপনি প্রথমবার নিচ্ছেন, আমরা ডেলিভারি চার্জ ফ্রী করে দিচ্ছি! অর্ডারের টোটাল ১২০০ টাকা। পেমেন্ট করে TrxID টা শেয়ার করুন ভাইয়া।",
            latency: '<i class="fa-solid fa-bolt"></i> Calculated discount using smart bargaining rules (1.2ms)'
        },
        verify: {
            user: "send money done, TrxID: 9K88F932J1",
            bot: "পেমেন্ট রিসিভড! ১২০০ টাকা সফলভাবে ভেরিফাই হয়েছে। আপনার অর্ডার কনফার্ম করা হলো এবং ২৪ ঘণ্টার মধ্যে উত্তরা ঠিকানায় পাঠিয়ে দেওয়া হবে।",
            latency: '<i class="fa-solid fa-bolt"></i> Auto-verified TrxID against bKash merchant logs in 1.8 seconds'
        }
    };
    
    if (chatBody && chatChips.length > 0) {
        chatChips.forEach(chip => {
            chip.addEventListener('click', () => {
                if (isSimulatorAnimating) return; // Prevent double clicks during active animation
                
                const type = chip.getAttribute('data-query');
                if (!simulations[type]) return;
                
                isSimulatorAnimating = true;
                
                // Clear original static messages / animation elements
                chatBody.innerHTML = '';
                
                // 1. Append User Bubble
                const userBubble = document.createElement('div');
                userBubble.className = 'msg msg-user';
                userBubble.textContent = simulations[type].user;
                chatBody.appendChild(userBubble);
                chatBody.scrollTop = chatBody.scrollHeight;
                
                // 2. Append Active Typing Indicator after a tiny delay
                setTimeout(() => {
                    const typingBubble = document.createElement('div');
                    typingBubble.className = 'msg msg-bot typing-indicator-active';
                    typingBubble.innerHTML = '<span></span><span></span><span></span>';
                    chatBody.appendChild(typingBubble);
                    chatBody.scrollTop = chatBody.scrollHeight;
                    
                    // 3. Remove Typing and Append Bot Response
                    setTimeout(() => {
                        typingBubble.remove();
                        
                        const botBubble = document.createElement('div');
                        botBubble.className = 'msg msg-bot';
                        botBubble.style.opacity = '0';
                        botBubble.style.transition = 'opacity 0.4s ease';
                        botBubble.textContent = simulations[type].bot;
                        chatBody.appendChild(botBubble);
                        
                        // Trigger CSS animation flow for opacity
                        setTimeout(() => {
                            botBubble.style.opacity = '1';
                        }, 50);
                        
                        chatBody.scrollTop = chatBody.scrollHeight;
                        
                        // Update latency text
                        if (latencyIndicator) {
                            latencyIndicator.innerHTML = simulations[type].latency;
                        }
                        
                        isSimulatorAnimating = false;
                    }, 1400);
                    
                }, 400);
            });
        });
    }
});
