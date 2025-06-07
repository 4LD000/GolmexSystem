// js/script.js

// Select DOM elements once for better performance
const menusItemsDropDown = document.querySelectorAll(".menu-item-dropdown");
const sidebar = document.getElementById("sidebar");
const menuBtnDesktop = document.getElementById("menu-btn"); // Button to minimize/expand on desktop
const sidebarBtnMobile = document.getElementById("sidebar-btn"); // Button to show/hide on mobile
const darkModeBtn = document.getElementById("dark-mode-btn");
const mainContent = document.querySelector("main");
const allMenuLinks = document.querySelectorAll(
  ".sidebar .menu-link, .sidebar .sub-menu-link"
); // All clickable menu links
const allDropdownParents = document.querySelectorAll(".menu-item-dropdown");

// Authentication and user profile elements
const userProfileArea = document.getElementById("user-profile-area");
const userNameElement = document.getElementById("user-name");
const userEmailElement = document.getElementById("user-email");
const userAvatarElement = document.getElementById("user-avatar");
const authButton = document.getElementById("auth-button");
const authRequiredMessage = document.getElementById("auth-required-message");
const mainAppContent = document.getElementById("main-app-content");

// --- Supabase Configuration ---
const SUPABASE_URL = "https://ogatafslnevidfopuvbp.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nYXRhZnNsbmV2aWRmb3B1dmJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY3NDM0MTQsImV4cCI6MjA2MjMxOTQxNH0.Z4uAWCmyzbiFBVM51vLHwo7larVx6Y3wYK6vMzgj9j0";

let supabase = null;
try {
  if (window.supabase && typeof window.supabase.createClient === "function") {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("Supabase client initialized in script.js.");
  } else {
    throw new Error(
      "Supabase library not found or createClient is not a function."
    );
  }
} catch (error) {
  console.error("Error initializing Supabase in script.js:", error);
}

// --- Domain and Exception Configuration for Login ---
const ALLOWED_DOMAINS_MAIN = ["@gmxecommerce.com", "@goldmexintl.com"];
const ALLOWED_EXCEPTIONS_MAIN = [
  "kikecanfir@gmail.com",
  "testuser@example.com",
];

// --- Inactivity Logout Configuration ---
let inactivityTimer;
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutos

// --- Global User State Tracking ---
let currentGlobalUserId = null; // Stores the ID of the currently authenticated user

/**
 * Checks if the user's email is allowed.
 * @param {string} email
 * @returns {boolean}
 */
function isUserAllowed(email) {
  if (!email) return false;
  const lowerEmail = email.toLowerCase();
  const domain = lowerEmail.substring(lowerEmail.lastIndexOf("@"));
  if (
    ALLOWED_DOMAINS_MAIN.includes(domain) ||
    ALLOWED_EXCEPTIONS_MAIN.includes(lowerEmail)
  )
    return true;
  console.warn(
    `Email ${lowerEmail} (domain: ${domain}) is not allowed (checked in script.js).`
  );
  return false;
}

// --- Supabase Authentication Functions ---
async function signOut(isDueToInactivity = false) {
  if (!supabase) {
    console.error("Supabase client is not available for signOut.");
    return;
  }
  try {
    stopInactivityTimer();
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Error signing out:", error.message);
      showCustomNotificationST(
        `Error al cerrar sesión: ${error.message}`,
        "error"
      );
    } else {
      console.log("Signed out successfully.");
      if (isDueToInactivity) {
        console.log("User logged out due to inactivity.");
      }
      // onAuthStateChange will handle UI updates and redirection
    }
  } catch (error) {
    console.error("Exception during sign out:", error);
    showCustomNotificationST(
      "Ocurrió un error inesperado al cerrar sesión.",
      "error"
    );
  }
}

// --- Inactivity Logout Functions ---
function logoutDueToInactivity() {
  console.log("Inactivity timeout reached. Logging out user...");
  // Notificación opcional, pero puede ser útil si el usuario regresa justo cuando sucede.
  showCustomNotificationST(
    "Has sido desconectado por inactividad.",
    "info",
    7000
  );
  signOut(true);
}

function resetInactivityTimer() {
  clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(logoutDueToInactivity, INACTIVITY_TIMEOUT_MS);
}

function startInactivityTimer() {
  stopInactivityTimer();
  console.log(
    `script.js: Starting inactivity timer for ${
      INACTIVITY_TIMEOUT_MS / 60000
    } minutes.`
  );
  resetInactivityTimer();
  window.addEventListener("mousemove", resetInactivityTimer, { passive: true });
  window.addEventListener("keydown", resetInactivityTimer, { passive: true });
  window.addEventListener("scroll", resetInactivityTimer, { passive: true });
  window.addEventListener("click", resetInactivityTimer, { passive: true });
  window.addEventListener("focus", resetInactivityTimer);
  document.addEventListener("visibilitychange", handleVisibilityChange);
}

function stopInactivityTimer() {
  clearTimeout(inactivityTimer);
  console.log("script.js: Inactivity timer stopped.");
  window.removeEventListener("mousemove", resetInactivityTimer);
  window.removeEventListener("keydown", resetInactivityTimer);
  window.removeEventListener("scroll", resetInactivityTimer);
  window.removeEventListener("click", resetInactivityTimer);
  window.removeEventListener("focus", resetInactivityTimer);
  document.removeEventListener("visibilitychange", handleVisibilityChange);
}

function handleVisibilityChange() {
  if (document.hidden) {
    // Tab is hidden, timer continues as per requirement.
    // console.log("script.js: Page hidden. Inactivity timer continues.");
  } else {
    // Tab is visible again.
    // console.log("script.js: Page visible. Inactivity timer reset.");
    resetInactivityTimer();
  }
}

// --- UI Update based on Authentication State ---
function updateUserUI(user) {
  console.log(
    "script.js: updateUserUI called with user:",
    user ? user.id : "null"
  );
  if (user) {
    if (userNameElement)
      userNameElement.textContent =
        user.user_metadata?.full_name || user.email.split("@")[0];
    if (userEmailElement) userEmailElement.textContent = user.email;
    if (userAvatarElement)
      userAvatarElement.src =
        user.user_metadata?.avatar_url || "assets/user-placeholder.jpg";
    if (authButton) {
      authButton.innerHTML = "<i class='bx bx-log-out'></i>";
      authButton.title = "Sign Out";
    }
    if (authRequiredMessage) authRequiredMessage.style.display = "none";
    if (mainAppContent) mainAppContent.style.display = "block";

    startInactivityTimer();

    const homeLink = document.querySelector('.menu-link[data-module="home"]');
    if (
      homeLink &&
      mainContent &&
      (!mainContent.dataset.currentModule ||
        ["auth-required", "access-denied", ""].includes(
          mainContent.dataset.currentModule
        ) ||
        mainContent.querySelector("#auth-required-message"))
    ) {
      if (mainContent) {
        mainContent.innerHTML =
          "<h1>GMX Content Area</h1><p>Welcome to the main dashboard. Please select an option from the menu.</p>";
        mainContent.dataset.currentModule = "home";
      }
      setActiveMenuItem(homeLink);
    }
  } else {
    if (userNameElement) userNameElement.textContent = "Guest";
    if (userEmailElement) userEmailElement.textContent = "Please sign in";
    if (userAvatarElement)
      userAvatarElement.src = "assets/user-placeholder.jpg";
    if (authButton) {
      authButton.innerHTML = "<i class='bx bx-log-in'></i>";
      authButton.title = "Sign In";
    }
    if (mainAppContent) mainAppContent.style.display = "none";
    setActiveMenuItem(null);
    stopInactivityTimer();
  }
}

// --- Main Event Handlers ---
if (darkModeBtn) {
  darkModeBtn.addEventListener("click", () => {
    document.body.classList.toggle("dark-mode");
    localStorage.setItem(
      "darkMode",
      document.body.classList.contains("dark-mode") ? "enabled" : "disabled"
    );
  });
  if (localStorage.getItem("darkMode") === "enabled") {
    document.body.classList.add("dark-mode");
  }
}

if (sidebarBtnMobile) {
  sidebarBtnMobile.addEventListener("click", () => {
    document.body.classList.toggle("sidebar-hidden");
    if (document.body.classList.contains("sidebar-hidden") && sidebar) {
      sidebar.classList.remove("minimize");
    }
  });
}

if (menuBtnDesktop) {
  menuBtnDesktop.addEventListener("click", () => {
    if (sidebar) sidebar.classList.toggle("minimize");
    if (sidebar?.classList.contains("minimize")) {
      menusItemsDropDown.forEach((item) => {
        if (item.classList.contains("sub-menu-toggle")) {
          item.classList.remove("sub-menu-toggle");
          const subMenu = item.querySelector(".sub-menu");
          if (subMenu) {
            subMenu.style.height = "0";
            subMenu.style.padding = "0";
          }
        }
      });
    }
  });
}

menusItemsDropDown.forEach((menuItem) => {
  const menuLink = menuItem.querySelector(":scope > .menu-link");
  if (menuLink) {
    menuLink.addEventListener("click", (event) => {
      event.preventDefault();
      if (sidebar?.classList.contains("minimize")) return;
      const subMenu = menuItem.querySelector(".sub-menu");
      const isActive = menuItem.classList.toggle("sub-menu-toggle");
      menusItemsDropDown.forEach((item) => {
        if (item !== menuItem && item.classList.contains("sub-menu-toggle")) {
          item.classList.remove("sub-menu-toggle");
          const otherSubmenu = item.querySelector(".sub-menu");
          if (otherSubmenu) {
            otherSubmenu.style.height = "0";
            otherSubmenu.style.padding = "0";
          }
        }
      });
      if (subMenu) {
        subMenu.style.height = isActive ? `${subMenu.scrollHeight + 6}px` : "0";
        subMenu.style.padding = isActive ? "0.2rem 0" : "0";
      }
    });
  }
});

if (authButton) {
  authButton.addEventListener("click", async () => {
    if (!supabase) return;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.user) await signOut();
    else window.location.href = "login.html";
  });
}

// --- Logic for Loading Modules and Active Menu State ---
function setActiveMenuItem(clickedLinkElement) {
  allMenuLinks.forEach((link) => link.classList.remove("link-active"));
  allDropdownParents.forEach((item) => item.classList.remove("parent-active"));
  if (clickedLinkElement) {
    clickedLinkElement.classList.add("link-active");
    const parentDropdown = clickedLinkElement.closest(".menu-item-dropdown");
    if (parentDropdown) {
      parentDropdown.classList.add("parent-active");
      if (
        sidebar &&
        !sidebar.classList.contains("minimize") &&
        !parentDropdown.classList.contains("sub-menu-toggle")
      ) {
        parentDropdown.classList.add("sub-menu-toggle");
        const subMenu = parentDropdown.querySelector(".sub-menu");
        if (subMenu) {
          subMenu.style.height = `${subMenu.scrollHeight + 6}px`;
          subMenu.style.padding = "0.2rem 0";
        }
      }
    }
  }
}

// En js/script.js

// REEMPLAZA ESTA FUNCIÓN COMPLETA
async function loadModule(moduleName, clickedLink) {
  if (!mainContent || !supabase) {
    console.error(
      "Main content area or Supabase client not found for loadModule."
    );
    return;
  }

  mainContent.innerHTML = `<div style="display:flex; justify-content:center; align-items:center; height:80vh; flex-direction:column;"><i class='bx bx-loader-alt bx-spin' style='font-size: 3rem; color: var(--goldmex-secondary-color);'></i><p style="margin-top: 1rem; font-size: 1.1rem; color: var(--color-text-secondary);">Loading ${moduleName}...</p></div>`;
  mainContent.dataset.currentModule = `loading-${moduleName}`;

  try {
    const response = await fetch(`${moduleName}.html`);
    if (!response.ok)
      throw new Error(
        `Could not load ${moduleName}.html. Status: ${response.status}`
      );

    const htmlContent = await response.text();
    mainContent.innerHTML = htmlContent;
    mainContent.dataset.currentModule = moduleName;
    setActiveMenuItem(clickedLink);

    // --- INICIO DE LA CORRECCIÓN CLAVE ---

    // 1. Eliminar cualquier script de módulo cargado anteriormente para evitar conflictos.
    const oldScript = document.getElementById("module-script");
    if (oldScript) {
      oldScript.remove();
    }

    // 2. Crear y añadir dinámicamente el script del nuevo módulo.
    const newScript = document.createElement("script");
    newScript.id = "module-script"; // Un ID para encontrarlo y eliminarlo en la siguiente carga.
    newScript.src = `js/${moduleName}.js`;

    // 3. El evento 'module_loaded' SOLO se dispara DESPUÉS de que el script se haya cargado y ejecutado.
    // Esto resuelve la condición de carrera (race condition).
    newScript.onload = () => {
      console.log(
        `SCRIPT.JS: Script 'js/${moduleName}.js' loaded. Dispatching module_loaded event.`
      );
      document.dispatchEvent(
        new CustomEvent("module_loaded", { detail: { moduleName } })
      );
    };

    newScript.onerror = () => {
      console.error(`Failed to load script: js/${moduleName}.js`);
      mainContent.innerHTML = `<div style="padding: 2rem; text-align: center;"><h2>Error loading module script: ${moduleName}.js</h2></div>`;
    };

    document.body.appendChild(newScript);

    // --- FIN DE LA CORRECCIÓN CLAVE ---
  } catch (error) {
    console.error("Error loading module:", error);
    mainContent.innerHTML = `<div style="padding: 2rem; text-align: center;"><h2>Error loading module: ${moduleName}</h2><p style="color: var(--goldmex-accent-color);">${error.message}</p></div>`;
    mainContent.dataset.currentModule = "error";
    setActiveMenuItem(null);
  }
}

allMenuLinks.forEach((link) => {
  const moduleName = link.dataset.module;
  if (moduleName) {
    link.addEventListener("click", async function (event) {
      event.preventDefault();
      if (moduleName === "home") {
        if (mainContent) {
          mainContent.innerHTML =
            "<h1>GMX Content Area</h1><p>Welcome to the main dashboard. Please select an option from the menu.</p>";
          mainContent.dataset.currentModule = "home";
        }
        setActiveMenuItem(this);
      } else {
        loadModule(moduleName, this);
      }
      if (
        window.innerWidth <= 768 &&
        sidebar &&
        !document.body.classList.contains("sidebar-hidden")
      ) {
        if (sidebarBtnMobile) sidebarBtnMobile.click();
      }
    });
  }
});

// --- Utility Functions and Initial Load ---
function handleResize() {
  if (window.innerWidth > 768 && document.body) {
    document.body.classList.remove("sidebar-hidden");
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  handleResize();
  if (!supabase) {
    console.error(
      "script.js: Supabase client not available on DOMContentLoaded."
    );
    if (!window.location.pathname.includes("/login.html"))
      window.location.href = "login.html";
    return;
  }

  supabase.auth.onAuthStateChange(async (event, session) => {
    console.log(
      `script.js: Auth state change event: ${event}`,
      session ? `User: ${session.user?.id}` : "No session"
    );
    const newUser = session ? session.user : null;
    let accessDenied = false;
    let userChanged =
      (!currentGlobalUserId && newUser) ||
      (currentGlobalUserId && !newUser) ||
      (currentGlobalUserId && newUser && currentGlobalUserId !== newUser.id);

    if (newUser && !isUserAllowed(newUser.email)) {
      console.warn(
        `script.js: User ${newUser.email} logged in but is NOT allowed. Forcing sign out.`
      );
      await supabase.auth.signOut(); // This will trigger another onAuthStateChange with session=null
      // currentGlobalUserId will be cleared in the subsequent event.
      // No need to update UI here as the signOut will lead to it.
      accessDenied = true; // Mark access denied to inform modules if needed
      userChanged = true; // Treat as a change for dispatching
    }

    if (userChanged && !accessDenied) {
      // Only update UI and timer if user state genuinely changed and access is not denied
      console.log(
        "script.js: User state changed. Updating UI and global user ID."
      );
      currentGlobalUserId = newUser ? newUser.id : null;
      updateUserUI(newUser); // This will start/stop inactivity timer appropriately
    } else if (!userChanged && newUser && !accessDenied) {
      console.log(
        "script.js: Auth state confirmed, user is the same. Inactivity timer NOT restarted by updateUserUI."
      );
      // If user is same, but maybe token refreshed, we still want to ensure inactivity timer IS running IF it should be.
      // updateUserUI already handles this by calling startInactivityTimer if user is present.
      // The key is not calling updateUserUI if user ID hasn't changed.
      // However, ensure inactivity timer IS running if currentGlobalUserId is set.
      if (currentGlobalUserId && inactivityTimer) {
        // Check if timer exists, implies it should be running
        // resetInactivityTimer(); // Optionally reset on any SIGNED_IN, even if user is same, for extra safety on token refresh
        // For now, let's stick to resetting only on genuine activity or focus.
      } else if (currentGlobalUserId && !inactivityTimer) {
        // This case should ideally not happen if logic is correct. But as a safeguard:
        console.warn(
          "script.js: User is current, but inactivity timer was not running. Restarting."
        );
        startInactivityTimer();
      }
    } else if (accessDenied && currentGlobalUserId) {
      // Access was denied for a previously logged-in user
      console.log(
        "script.js: Access denied for previously logged in user. UI should reflect no user soon via next auth event."
      );
      // currentGlobalUserId will be cleared when signOut's onAuthStateChange event comes.
    }

    // Always dispatch the custom event for modules to react if they need to.
    // Modules have their own logic to decide if they need to re-subscribe or reload data.
    console.log(
      "script.js: Dispatching supabaseAuthStateChange event to modules. User:",
      newUser ? newUser.id : "null",
      "Access Denied:",
      accessDenied
    );
    document.dispatchEvent(
      new CustomEvent("supabaseAuthStateChange", {
        detail: { user: newUser, event, accessDenied, source: "script.js" },
      })
    );

    // Handle redirection to login if no user, after dispatching event
    if (!newUser && !window.location.pathname.includes("/login.html")) {
      console.log("script.js: No user session, redirecting to login.html");
      window.location.href = "login.html";
    } else if (
      newUser &&
      window.location.pathname.includes("/login.html") &&
      !accessDenied
    ) {
      // If user is logged in and on login page (and not just denied access), redirect to index
      console.log(
        "script.js: User authenticated on login page, redirecting to index.html"
      );
      window.location.href = "index.html";
    }
  });

  // Initial session check
  console.log("script.js: Performing initial session check...");
  const {
    data: { session: initialSession },
    error: initialSessionError,
  } = await supabase.auth.getSession();
  if (initialSessionError) {
    console.error(
      "script.js: Error getting initial session:",
      initialSessionError.message
    );
  }
  // The onAuthStateChange listener will be triggered by getSession(),
  // so it will handle the initial UI update and redirection if necessary.
  // No need to duplicate logic here.
  console.log(
    "script.js: Initial session check completed. onAuthStateChange will handle the result."
  );
});

window.addEventListener("resize", handleResize);

function showCustomNotificationST(message, type = "info", duration = 3800) {
  // console.log(`Notification (${type}) from script.js: ${message}`); // Kept for debugging
  const containerId = "customNotificationContainerST_Global";
  let notificationContainer = document.getElementById(containerId);
  if (!notificationContainer) {
    notificationContainer = document.createElement("div");
    notificationContainer.id = containerId;
    notificationContainer.style.position = "fixed";
    notificationContainer.style.top = "20px";
    notificationContainer.style.right = "20px";
    notificationContainer.style.zIndex = "2050";
    notificationContainer.style.display = "flex";
    notificationContainer.style.flexDirection = "column";
    notificationContainer.style.gap = "10px";
    document.body.appendChild(notificationContainer);
  }

  const notification = document.createElement("div");
  // Basic styling, assuming main CSS handles .custom-notification-st if defined there
  notification.style.padding = "12px 18px";
  notification.style.borderRadius = "6px";
  notification.style.color = "#fff";
  notification.style.fontWeight = "500";
  notification.style.boxShadow = "0 5px 15px rgba(0,0,0,0.2)";
  notification.style.display = "flex";
  notification.style.alignItems = "center";
  notification.style.gap = "10px";
  notification.style.minWidth = "280px";
  notification.style.opacity = "0";
  notification.style.transform = "translateX(110%)";
  notification.style.transition = "transform 0.4s ease, opacity 0.4s ease";

  let iconClass = "bx bx-info-circle";
  if (type === "success") {
    iconClass = "bx bx-check-circle";
    notification.style.backgroundColor = "#28a745";
  } else if (type === "error") {
    iconClass = "bx bx-x-circle";
    notification.style.backgroundColor = "#e31837";
  } else if (type === "warning") {
    iconClass = "bx bx-error-circle";
    notification.style.backgroundColor = "#ffc107";
    notification.style.color = "#212529";
  } else {
    // info
    notification.style.backgroundColor = "#17a2b8";
  }

  notification.innerHTML = `<i class='${iconClass}' style="font-size:1.3rem;"></i><span>${message}</span><button class='custom-notification-st-close-global' style="background:none;border:none;color:inherit;opacity:0.7;font-size:1.3rem;font-weight:bold;cursor:pointer;margin-left:auto;">&times;</button>`;
  notificationContainer.appendChild(notification);

  void notification.offsetWidth;
  notification.style.opacity = "1";
  notification.style.transform = "translateX(0)";

  const closeButton = notification.querySelector(
    ".custom-notification-st-close-global"
  );
  const removeNotification = () => {
    if (notification.parentNode) {
      notification.style.opacity = "0";
      notification.style.transform = "translateX(110%)";
      setTimeout(() => {
        notification.remove();
        // if (notificationContainer.childElementCount === 0 && notificationContainer.id === containerId) {
        //   notificationContainer.remove(); // Optional
        // }
      }, 400);
    }
  };
  closeButton.addEventListener("click", removeNotification);
  if (duration > 0) {
    setTimeout(removeNotification, duration);
  }
}
