// js/script.js (COMPLETO Y CORREGIDO)

console.log("Script.js: >>> SCRIPT EXECUTION STARTED <<<");

// Select DOM elements once for better performance
const menusItemsDropDown = document.querySelectorAll(".menu-item-dropdown");
const sidebar = document.getElementById("sidebar");
const menuBtnDesktop = document.getElementById("menu-btn");
const sidebarBtnMobile = document.getElementById("sidebar-btn");
const darkModeBtn = document.getElementById("dark-mode-btn");
const mainContent = document.querySelector("main");
const allMenuLinks = document.querySelectorAll(
  ".sidebar .menu-link, .sidebar .sub-menu-link"
);
const allDropdownParents = document.querySelectorAll(".menu-item-dropdown");

// Authentication and user profile elements
const userProfileArea = document.getElementById("user-profile-area");
const userNameElement = document.getElementById("user-name");
const userEmailElement = document.getElementById("user-email");
const userAvatarElement = document.getElementById("user-avatar");
const authButton = document.getElementById("auth-button");
const authRequiredMessage = document.getElementById("auth-required-message");
const mainAppContent = document.getElementById("main-app-content");
const userContainer = document.querySelector(".user");

// --- Supabase Configuration ---
const SUPABASE_URL = "https://ogatafslnevidfopuvbp.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nYXRhZnNsbmV2aWRmb3B1dmJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY3NDM0MTQsImV4cCI6MjA2MjMxOTQxNH0.Z4uAWCmyzbiFBVM51vLHwo7larVx6Y3wYK6vMzgj9j0";

try {
  if (window.supabase && typeof window.supabase.createClient === "function") {
    window.supabase = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY
    );
    console.log("Supabase client initialized in script.js.");
  } else {
    throw new Error(
      "Supabase library not found or createClient is not a function."
    );
  }
} catch (error) {
  console.error("Error initializing Supabase in script.js:", error);
}

// --- Inactivity Logout Configuration ---
let inactivityTimer;
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

// --- Global User State Tracking ---
let currentGlobalUserId = null;
let currentGlobalProfile = null;
let currentGlobalUser = null;

// --- Role Configuration ---
const MANAGER_USERS = [
  "fulfillment@gmxecommerce.com",
  "tgarcia@goldmexintl.com",
  "kmartinez@goldmexintl.com",
  "anogales@goldmexintl.com",
  "carlos@flexbpo.com",
  "alexandermontes@flexbpo.com",
  "jorge@customscity.com",
  "jachags@gmail.com",
  "aesquivez@goldmexintl.com"
];

const EMPLOYEE_DOMAINS = ["@gmxecommerce.com", "@goldmexintl.com"];
const EMPLOYEE_EXCEPTIONS = [
  "kikecanfir@gmail.com",
  "enriqueflores.10@hotmail.com",
  "jatejix@gmail.com"
];

const RESTRICTED_VIEW_DOMAINS = [
  "estafeta.com",
  "gelalogs.com",
  "viettelpost.com.vn",
];

const RESTRICTED_VIEW_USERS = [
  "kikecanfir5@gmail.com",
  "quynhanhtruonga8@gmail.com",
  "quanganhpn2002@gmail.com",
];

const CLIENT_VIEW_MODULES = ["brokerage-cqp", "import-portal"];

function isUserAllowed(email) {
  if (!email) return false;
  const lowerEmail = email.toLowerCase();
  const domain = lowerEmail.substring(lowerEmail.lastIndexOf("@"));

  if (
    MANAGER_USERS.includes(lowerEmail) ||
    EMPLOYEE_DOMAINS.includes(domain) ||
    EMPLOYEE_EXCEPTIONS.includes(lowerEmail) ||
    RESTRICTED_VIEW_DOMAINS.includes(domain) ||
    RESTRICTED_VIEW_USERS.includes(lowerEmail)
  ) {
    return true;
  }
  return false;
}

// --- CORRECCIÓN CRÍTICA EN SIGNOUT (Actualizado para limpieza profunda) ---
async function signOut(isDueToInactivity = false) {
  if (!window.supabase) return;
  
  try {
    stopInactivityTimer();
    
    // Intentamos cerrar sesión en el servidor
    const { error } = await window.supabase.auth.signOut();
    
    if (error) {
      // Si hay error (ej. 403 session missing), solo lo registramos como warning
      // pero NO detenemos el proceso de limpieza local.
      console.warn("Supabase signOut warning (forcing local logout):", error.message);
    } else {
      console.log("Signed out successfully from server.");
    }

  } catch (error) {
    console.error("Exception during sign out:", error);
  } finally {
    // *** LIMPIEZA FORZADA ***
    // Esto se ejecuta SIEMPRE, haya error o no.
    
    console.log("Performing local session cleanup...");
    currentGlobalUserId = null;
    currentGlobalUser = null;
    currentGlobalProfile = null;

    // 1. Limpiar localStorage específico de Workstation (EL FIX PARA CRUCE DE SESIONES)
    localStorage.removeItem('gmx_wst_session_v4_cloud');

    // 2. Limpiar localStorage específico de Supabase para evitar el bucle de sesión fantasma
    const projectKey = 'sb-ogatafslnevidfopuvbp-auth-token'; 
    localStorage.removeItem(projectKey);

    updateUserUI(null);
    window.location.href = "login.html";
  }
}

// --- Inactivity Logout Functions ---
function logoutDueToInactivity() {
  console.log("Inactivity timeout reached. Logging out user...");
  showCustomNotificationST(
    "You have been logged out due to inactivity.",
    "info",
    7000
  );
  signOut(true);
}

function resetInactivityTimer() {
  clearTimeout(inactivityTimer);
  
  // Check: If Ranking/TV mode is active, disable logout timer.
  const currentModule = mainContent ? mainContent.dataset.currentModule : '';
  if (currentModule === 'wst-ranking') {
      return; 
  }

  inactivityTimer = setTimeout(logoutDueToInactivity, INACTIVITY_TIMEOUT_MS);
}

function startInactivityTimer() {
  stopInactivityTimer();

  // Initial Check for TV mode
  const currentModule = mainContent ? mainContent.dataset.currentModule : '';
  if (currentModule === 'wst-ranking') {
      console.log("TV Mode detected on start: Inactivity timer skipped.");
      return;
  }

  console.log(`script.js: Starting inactivity timer.`);
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
  window.removeEventListener("mousemove", resetInactivityTimer);
  window.removeEventListener("keydown", resetInactivityTimer);
  window.removeEventListener("scroll", resetInactivityTimer);
  window.removeEventListener("click", resetInactivityTimer);
  window.removeEventListener("focus", resetInactivityTimer);
  document.removeEventListener("visibilitychange", handleVisibilityChange);
}

function handleVisibilityChange() {
  if (!document.hidden) {
    resetInactivityTimer();
  }
}

function updateUserUI(user, profile = null) {
  const allMenuItems = document.querySelectorAll(".sidebar .menu > .menu-item");

  if (user) {
    const displayName = profile
      ? profile.full_name
      : user.user_metadata?.full_name || user.email.split("@")[0];
    const displayAvatar = profile
      ? profile.avatar_url
      : user.user_metadata?.avatar_url || "assets/user-placeholder.jpg";

    if (userNameElement) userNameElement.textContent = displayName;
    if (userEmailElement) userEmailElement.textContent = user.email;
    if (userAvatarElement) userAvatarElement.src = displayAvatar;

    if (authButton) {
      authButton.innerHTML = "<i class='bx bx-log-out'></i>";
      authButton.title = "Sign Out";
    }
    if (authRequiredMessage) authRequiredMessage.style.display = "none";
    if (mainAppContent) mainAppContent.style.display = "block";

    if (!profile && userContainer) {
      userContainer.classList.add("loading-profile");
    }
    
    // Determine Role & Visibility
    const userEmail = user.email.toLowerCase();
    const userDomain = userEmail.substring(userEmail.lastIndexOf("@"));
    let userRole = "Employee";
    
    if (MANAGER_USERS.includes(userEmail)) userRole = "Manager";
    else if (
      RESTRICTED_VIEW_DOMAINS.includes(userDomain) ||
      RESTRICTED_VIEW_USERS.includes(userEmail)
    ) userRole = "Client";

    switch (userRole) {
      case "Manager":
        allMenuItems.forEach((item) => {
          item.style.display = "list-item";
          item.querySelectorAll(".sub-menu > li").forEach((sub) => (sub.style.display = "list-item"));
        });
        break;
      case "Client":
        allMenuItems.forEach((menuItem) => {
          const link = menuItem.querySelector(".menu-link");
          if (!link) return;
          const moduleName = link.dataset.module;
          const isDropdown = menuItem.classList.contains("menu-item-dropdown");

          if (isDropdown) {
            let hasVisibleSubMenu = false;
            menuItem.querySelectorAll(".sub-menu-link").forEach((subLink) => {
              if (CLIENT_VIEW_MODULES.includes(subLink.dataset.module)) {
                hasVisibleSubMenu = true;
                subLink.parentElement.style.display = "list-item";
              } else {
                subLink.parentElement.style.display = "none";
              }
            });
            menuItem.style.display = hasVisibleSubMenu ? "list-item" : "none";
          } else if (moduleName) {
            menuItem.style.display = CLIENT_VIEW_MODULES.includes(moduleName) ? "list-item" : "none";
          }
        });
        break;
      default:
        allMenuItems.forEach((menuItem) => {
          const link = menuItem.querySelector(".menu-link");
          if (!link) return;
          const moduleName = link.dataset.module;
          const isDropdown = menuItem.classList.contains("menu-item-dropdown");

          if (isDropdown) {
            let hasVisibleSubMenu = false;
            menuItem.querySelectorAll(".sub-menu-link").forEach((subLink) => {
              if (CLIENT_VIEW_MODULES.includes(subLink.dataset.module)) {
                subLink.parentElement.style.display = "none";
              } else {
                hasVisibleSubMenu = true;
                subLink.parentElement.style.display = "list-item";
              }
            });
            menuItem.style.display = hasVisibleSubMenu ? "list-item" : "none";
          } else if (moduleName) {
            menuItem.style.display = CLIENT_VIEW_MODULES.includes(moduleName) ? "none" : "list-item";
          }
        });
        break;
    }

    startInactivityTimer();

    const homeLink = document.querySelector('.menu-link[data-module="home"]');
    if (
      homeLink &&
      mainContent &&
      (!mainContent.dataset.currentModule ||
        ["auth-required", "access-denied", ""].includes(mainContent.dataset.currentModule))
    ) {
        if (mainContent) {
             mainContent.innerHTML = "<h1>GMX Content Area</h1><p>Welcome.</p>";
             mainContent.dataset.currentModule = "home";
        }
        setActiveMenuItem(homeLink);
    }

  } else {
    if (userNameElement) userNameElement.textContent = "Guest";
    if (userEmailElement) userEmailElement.textContent = "Please sign in";
    if (userAvatarElement) userAvatarElement.src = "assets/user-placeholder.jpg";
    
    if (authButton) {
      authButton.innerHTML = "<i class='bx bx-log-in'></i>";
      authButton.title = "Sign In";
    }
    if (mainAppContent) mainAppContent.style.display = "none";
    if (authRequiredMessage) authRequiredMessage.style.display = "block";
    
    document.body.classList.remove("sidebar-loaded");
    if (userContainer) userContainer.classList.remove("loading-profile");

    setActiveMenuItem(null);
    stopInactivityTimer();
  }
}

async function fetchProfileAndUpdateUI(user) {
  let profileData = null;
  try {
    const { data: profile, error } = await window.supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error) throw error;

    if (profile) {
      profileData = profile;
      currentGlobalProfile = profile;
      updateUserUI(user, profile);
    } else {
      updateUserUI(user);
    }

    document.dispatchEvent(
        new CustomEvent("supabaseAuthStateChange", { detail: { user: user, profile: profileData } })
    );

  } catch (error) {
    console.error("Error fetching profile:", error.message);
    updateUserUI(user);
    currentGlobalProfile = null;
    document.dispatchEvent(
        new CustomEvent("supabaseAuthStateChange", { detail: { user: user, profile: null } })
    );
  } finally {
    if (userContainer) userContainer.classList.remove("loading-profile");
    setTimeout(() => {
        document.body.classList.add("sidebar-loaded");
    }, 50);
  }
}

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
    if (!window.supabase) return;
    const { data: { session } } = await window.supabase.auth.getSession();
    if (session?.user) await signOut();
    else window.location.href = "login.html";
  });
}

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

async function loadModule(moduleName, clickedLink) {
  if (!mainContent || !window.supabase) return;
  
  document.dispatchEvent(new CustomEvent("moduleWillUnload"));
  if (authRequiredMessage) authRequiredMessage.style.display = "none";
  if (mainAppContent) mainAppContent.style.display = "block";
  
  mainContent.innerHTML = `<div style="display:flex; justify-content:center; align-items:center; height:80vh; flex-direction:column;"><i class='bx bx-loader-alt bx-spin' style='font-size: 3rem; color: var(--goldmex-secondary-color);'></i><p style="margin-top: 1rem; font-size: 1.1rem; color: var(--color-text-secondary);">Loading ${moduleName}...</p></div>`;
  mainContent.dataset.currentModule = `loading-${moduleName}`;
  
  // ** INACTIVITY CHECK: Stop timer if loading Rank/TV module **
  if (moduleName === 'wst-ranking') {
      stopInactivityTimer();
  } else {
      if (currentGlobalUser) startInactivityTimer();
  }

  try {
    const response = await fetch(`${moduleName}.html`);
    if (!response.ok) throw new Error(`Could not load ${moduleName}.html`);
    const htmlContent = await response.text();
    mainContent.innerHTML = htmlContent;

    const moduleContainer = mainContent.children[0];
    if (moduleContainer) {
      moduleContainer.classList.add("module-enter-animation");
    }

    mainContent.dataset.currentModule = moduleName;
    setActiveMenuItem(clickedLink);
    
    document.dispatchEvent(
      new CustomEvent("moduleContentLoaded", { detail: { moduleName } })
    );
    
    Array.from(mainContent.querySelectorAll("script")).forEach((oldScript) => {
      const newScript = document.createElement("script");
      Array.from(oldScript.attributes).forEach((attr) =>
        newScript.setAttribute(attr.name, attr.value)
      );
      if (oldScript.textContent) newScript.textContent = oldScript.textContent;
      
      if (oldScript.parentNode)
        oldScript.parentNode.replaceChild(newScript, oldScript);
      else document.body.appendChild(newScript).remove();
    });

    const onModuleReady = (event) => {
        if (event.detail?.moduleName === moduleName) {
            if (currentGlobalUser) {
                document.dispatchEvent(
                    new CustomEvent("supabaseAuthStateChange", {
                        detail: {
                            user: currentGlobalUser,
                            profile: currentGlobalProfile
                        }
                    })
                );
            } else {
                document.dispatchEvent(
                    new CustomEvent("supabaseAuthStateChange", {
                        detail: { user: null, profile: null }
                    })
                );
            }
            document.removeEventListener("moduleReadyForAuth", onModuleReady);
        }
    };
    document.addEventListener("moduleReadyForAuth", onModuleReady);

  } catch (error) {
    mainContent.innerHTML = `<div style="padding: 2rem; text-align: center;"><h2>Error loading module: ${moduleName}</h2><p style="color: var(--goldmex-accent-color);">${error.message}</p></div>`;
    mainContent.dataset.currentModule = "error";
    setActiveMenuItem(clickedLink);
  }
}

allMenuLinks.forEach((link) => {
  const moduleName = link.dataset.module;
  if (moduleName) {
    link.addEventListener("click", async function (event) {
      event.preventDefault();
      loadModule(moduleName, this);

      if (
        window.innerWidth <= 768 &&
        document.body.classList.contains("sidebar-hidden")
      ) {
        sidebarBtnMobile.click();
      }
    });
  }
});

function handleResize() {
  if (window.innerWidth > 768 && document.body) {
    document.body.classList.remove("sidebar-hidden");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  handleResize();

  if (!window.supabase) {
    if (!window.location.pathname.includes("/login.html")) {
      window.location.href = "login.html";
    }
    return;
  }

  window.supabase.auth.onAuthStateChange(async (event, session) => {
    const newUser = session ? session.user : null;
    stopInactivityTimer();

    if (newUser) {
      currentGlobalUser = newUser;

      if (currentGlobalUserId !== newUser.id) {
        currentGlobalUserId = newUser.id;
        updateUserUI(newUser);
        fetchProfileAndUpdateUI(newUser);

        const homeLink = document.querySelector('.sidebar .menu-link[data-module="home"]');
        if (homeLink) loadModule("home", homeLink);

      } else {
         startInactivityTimer();
         document.dispatchEvent(
            new CustomEvent("supabaseAuthStateChange", { detail: { user: newUser, profile: currentGlobalProfile } })
         );
      }
    } else {
      currentGlobalUserId = null;
      currentGlobalUser = null;
      currentGlobalProfile = null;
      updateUserUI(null);
      document.dispatchEvent(
        new CustomEvent("supabaseAuthStateChange", { detail: { user: null, profile: null } })
      );
    }

    const isLoginPage = window.location.pathname.includes("/login.html");
    if (!newUser && !isLoginPage) {
      window.location.href = "login.html";
    } else if (newUser && isLoginPage) {
      window.location.href = "index.html";
    }
  });
});

window.addEventListener("resize", handleResize);

function showCustomNotificationST(message, type = "info", duration = 3800) {
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
      }, 400);
    }
  };
  closeButton.addEventListener("click", removeNotification);
  if (duration > 0) {
    setTimeout(removeNotification, duration);
  }
}
