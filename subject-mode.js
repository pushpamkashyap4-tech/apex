import React from "react";

export const JEE_SUBJECTS = ["Physics", "Chemistry", "Mathematics"];
export const NEET_SUBJECTS = ["Physics", "Chemistry", "Botany", "Zoology"];
export const SubjectModeContext = React.createContext({ isNeetMode: false, subjects: JEE_SUBJECTS });
export const useSubjectMode = () => React.useContext(SubjectModeContext);
