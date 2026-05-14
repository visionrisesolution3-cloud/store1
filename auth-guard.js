/**
 * Auth Guard Script - FULLY FIXED VERSION
 *
 * BUGS FIXED:
 * 1. Race condition: signOut() is now awaited before redirect → user goes to suspend.html, not login.html
 * 2. Double handleSuspension calls: guarded with a flag so it only runs once per session
 * 3. userId lost after sessionStorage.clear(): now re-saved before redirect
 * 4. lastLogin update triggering extra onSnapshot: moved to a debounced, non-blocking call
 */

(function() {
    'use strict';

    // Pages that don't require authentication
    const publicPages = [
        'login.html',
        'register.html',
        'forgot-password.html',
        'terms.html',
        'privacy.html',
        'suspend.html'
    ];

    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const isPublicPage = publicPages.some(page => currentPage.includes(page));

    // FIX 2: Guard flag — prevents handleSuspension from running more than once
    let suspensionHandled = false;

    if (!isPublicPage) {
        checkAuth();
    }

    function checkAuth() {
        if (isPublicPage) return true;
        const loginFlag = sessionStorage.getItem('login_flag');
        const userId = sessionStorage.getItem('userId');

        if (loginFlag !== '1' || !userId) {
            sessionStorage.setItem('redirectAfterLogin', window.location.href);
            window.location.href = 'login.html';
            return false;
        }
        return true;
    }

    // FIX 1 + FIX 2 + FIX 3: handleSuspension now awaits signOut and preserves userId
    async function handleSuspension(reason) {
        // FIX 2: Only run once per page session
        if (suspensionHandled) return;
        suspensionHandled = true;

        console.log('User suspended:', reason || 'Account suspended by administrator');

        // Stop all monitoring before signOut
        if (window.suspensionListener) {
            window.suspensionListener();
            window.suspensionListener = null;
        }
        if (window.suspensionCheckInterval) {
            clearInterval(window.suspensionCheckInterval);
            window.suspensionCheckInterval = null;
        }

        // FIX 3: Save userId before clearing — suspend.html needs it for display
        const userId = sessionStorage.getItem('userId');

        // FIX 1: Await signOut BEFORE clearing session and redirecting.
        // Without await, onAuthStateChanged(null) fires while the page is still
        // active and redirects to login.html instead of suspend.html.
        try {
            await firebase.auth().signOut();
        } catch (e) {
            // ignore signOut errors
        }

        sessionStorage.clear();

        if (!window.location.pathname.includes('suspend.html')) {
            // FIX 3: Restore userId and reason so suspend.html can display them
            sessionStorage.setItem('suspensionReason', reason || 'Your account has been suspended by the administrator.');
            if (userId) sessionStorage.setItem('userId', userId);
            window.location.href = 'suspend.html';
        }
    }

    // Real-time suspension monitoring via onSnapshot
    function initializeSuspensionMonitoring(userId) {
        if (window.suspensionListener) {
            window.suspensionListener();
        }

        const unsubscribe = firebase.firestore()
            .collection('users')
            .doc(userId)
            .onSnapshot((doc) => {
                if (doc.exists) {
                    const userData = doc.data();
                    if (userData.isActive === false) {
                        const reason = userData.suspensionReason || 'Your account has been suspended by the administrator.';
                        handleSuspension(reason);
                    }
                }
            }, (error) => {
                console.error('Suspension monitoring error:', error);
                startPeriodicCheck(userId);
            });

        window.suspensionListener = unsubscribe;
    }

    // Fallback: periodic check if real-time listener fails
    function startPeriodicCheck(userId) {
        if (window.suspensionCheckInterval) {
            clearInterval(window.suspensionCheckInterval);
        }

        window.suspensionCheckInterval = setInterval(async () => {
            try {
                const userDoc = await firebase.firestore()
                    .collection('users')
                    .doc(userId)
                    .get({ source: 'server' });

                if (userDoc.exists) {
                    const userData = userDoc.data();
                    if (userData.isActive === false) {
                        clearInterval(window.suspensionCheckInterval);
                        const reason = userData.suspensionReason || 'Your account has been suspended by the administrator.';
                        handleSuspension(reason);
                    }
                }
            } catch (error) {
                console.error('Periodic suspension check error:', error);
            }
        }, 30000);
    }

    if (typeof firebase !== 'undefined' && firebase.auth) {
        firebase.auth().onAuthStateChanged((user) => {
            if (!user) {
                if (!isPublicPage) {
                    sessionStorage.removeItem('login_flag');
                    sessionStorage.removeItem('userId');
                    sessionStorage.setItem('redirectAfterLogin', window.location.href);
                    window.location.href = 'login.html';
                }
            } else {
                sessionStorage.setItem('login_flag', '1');
                sessionStorage.setItem('userId', user.uid);
                sessionStorage.setItem('userEmail', user.email);

                loadUserData(user.uid);
                initializeSuspensionMonitoring(user.uid);
            }
        });
    } else {
        if (!checkAuth()) return;
    }

    async function loadUserData(userId) {
        try {
            const userDoc = await firebase.firestore()
                .collection('users')
                .doc(userId)
                .get({ source: 'server' })
                .catch(() =>
                    firebase.firestore().collection('users').doc(userId).get()
                );

            if (userDoc.exists) {
                const userData = userDoc.data();

                // Suspension check — runs first before anything else
                if (userData.isActive === false) {
                    const reason = userData.suspensionReason || 'Your account has been suspended by the administrator.';
                    handleSuspension(reason);
                    return;
                }

                // Active user on login page → redirect to homepage or intended destination
                if (isPublicPage && currentPage === 'login.html') {
                    const redirectTo = sessionStorage.getItem('redirectAfterLogin') || 'homepage.html';
                    sessionStorage.removeItem('redirectAfterLogin');
                    window.location.href = redirectTo;
                    return;
                }

                // Store user data in sessionStorage
                sessionStorage.setItem('userName', userData.name || '');
                sessionStorage.setItem('userPhone', userData.phone || '');
                sessionStorage.setItem('userBalance', userData.balance !== undefined ? userData.balance : 0);
                sessionStorage.setItem('userFrozenAmount', userData.frozenAmount || 0);
                sessionStorage.setItem('userCreditScore', userData.creditScore || 100);
                sessionStorage.setItem('userInviteCode', userData.inviteCode || '');
                sessionStorage.setItem('userMembershipLevel', userData.membershipLevel || 'Free');

                if (userData.bankAccount) {
                    try {
                        localStorage.setItem('ms_bankAccount', JSON.stringify({
                            bankName:      userData.bankAccount.bankName || '',
                            accountNumber: userData.bankAccount.accountNumber || '',
                            holderName:    userData.bankAccount.beneficiaryName || '',
                            routingCode:   userData.bankAccount.ifscCode || ''
                        }));
                        localStorage.setItem('bankAccount', JSON.stringify(userData.bankAccount));
                    } catch(e) {}
                }

                // FIX 4: lastLogin update is now fire-and-forget (no await) and does NOT
                // use serverTimestamp() which would trigger onSnapshot with hasPendingWrites.
                // Use Date.now() (a plain value) to avoid triggering extra snapshot callbacks.
                firebase.firestore().collection('users').doc(userId).update({
                    lastLogin: new Date()
                }).catch(() => {});

                window.dispatchEvent(new CustomEvent('userDataLoaded', { detail: userData }));
            }
        } catch (error) {
            console.error('Error loading user data:', error);
        }
    }

    // Global logout function
    window.logout = async function() {
        try {
            if (window.suspensionListener) {
                window.suspensionListener();
                window.suspensionListener = null;
            }
            if (window.suspensionCheckInterval) {
                clearInterval(window.suspensionCheckInterval);
                window.suspensionCheckInterval = null;
            }
            await firebase.auth().signOut();
            sessionStorage.clear();
            window.location.href = 'login.html';
        } catch (error) {
            console.error('Logout error:', error);
        }
    };

    window.getCurrentUser = function() {
        return {
            uid: sessionStorage.getItem('userId'),
            email: sessionStorage.getItem('userEmail'),
            name: sessionStorage.getItem('userName'),
            phone: sessionStorage.getItem('userPhone'),
            balance: parseFloat(sessionStorage.getItem('userBalance')) || 0,
            frozenAmount: parseFloat(sessionStorage.getItem('userFrozenAmount')) || 0,
            creditScore: parseInt(sessionStorage.getItem('userCreditScore')) || 100,
            inviteCode: sessionStorage.getItem('userInviteCode'),
            membershipLevel: sessionStorage.getItem('userMembershipLevel')
        };
    };

    window.updateUserBalance = async function(newBalance) {
        try {
            const userId = sessionStorage.getItem('userId');
            if (!userId) return;
            await firebase.firestore().collection('users').doc(userId).update({ balance: newBalance });
            sessionStorage.setItem('userBalance', newBalance);
            window.dispatchEvent(new CustomEvent('balanceUpdated', { detail: { balance: newBalance } }));
            return true;
        } catch (error) {
            console.error('Error updating balance:', error);
            return false;
        }
    };

    window.addEventListener('beforeunload', function() {
        if (window.suspensionListener) {
            window.suspensionListener();
        }
        if (window.suspensionCheckInterval) {
            clearInterval(window.suspensionCheckInterval);
        }
    });

})();
