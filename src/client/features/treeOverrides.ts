import { createContext, useContext } from "react";

/** Lets an open page show its new title and icon in the sidebar as soon as they're saved. */
export const TreeRenameContext = createContext<(id: string, title: string, icon: string | null) => void>(() => {});
export const useTreeRename = () => useContext(TreeRenameContext);
