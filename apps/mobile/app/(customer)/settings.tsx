import React from "react";
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { theme } from "../../constants/theme";
import { useLanguage } from "../../features/i18n/LanguageProvider";
import { useAndroidBack } from "../../hooks/useAndroidBack";

export default function CustomerSettings() {
  const router = useRouter();
  const { t } = useLanguage();
  useAndroidBack();
  return <SafeAreaView style={styles.safe}>
    <View style={styles.header}>
      <TouchableOpacity onPress={() => router.back()} style={styles.back}><Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary}/></TouchableOpacity>
      <Text style={styles.title}>{t("account.settings")}</Text>
    </View>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.section}>{t("account.settings")}</Text>
        <TouchableOpacity style={styles.row} onPress={() => router.push("/(customer)/faqs" as any)}>
          <Ionicons name="help-circle-outline" size={22} color={theme.colors.primary}/><Text style={styles.rowText}>{t("account.faqs")}</Text><Ionicons name="chevron-forward" size={20} color={theme.colors.textTertiary}/>
        </TouchableOpacity>
        <TouchableOpacity style={styles.row} onPress={() => router.push("/(customer)/delete-account" as any)}>
          <Ionicons name="trash-outline" size={22} color={theme.colors.error}/><Text style={[styles.rowText,{color:theme.colors.error}]}>{t("account.delete.title")}</Text><Ionicons name="chevron-forward" size={20} color={theme.colors.textTertiary}/>
        </TouchableOpacity>
      </View>
      <View style={styles.card}>
        <Text style={styles.section}>{t("profile.support")}</Text>
        <TouchableOpacity style={styles.row} onPress={() => router.push({pathname:"/(auth)/legal",params:{document:"privacy"}} as any)}><Text style={styles.rowText}>Privacy Policy</Text><Ionicons name="chevron-forward" size={20} color={theme.colors.textTertiary}/></TouchableOpacity>
        <TouchableOpacity style={styles.row} onPress={() => router.push({pathname:"/(auth)/legal",params:{document:"terms"}} as any)}><Text style={styles.rowText}>Terms of Service</Text><Ionicons name="chevron-forward" size={20} color={theme.colors.textTertiary}/></TouchableOpacity>
        <TouchableOpacity style={styles.row} onPress={() => router.push({pathname:"/(auth)/legal",params:{document:"refunds"}} as any)}><Text style={styles.rowText}>Refund & Cancellation</Text><Ionicons name="chevron-forward" size={20} color={theme.colors.textTertiary}/></TouchableOpacity>
      </View>
    </ScrollView>
  </SafeAreaView>;
}
const styles=StyleSheet.create({safe:{flex:1,backgroundColor:theme.colors.background},header:{flexDirection:"row",alignItems:"center",padding:theme.spacing.lg,backgroundColor:theme.colors.surface,borderBottomWidth:1,borderBottomColor:theme.colors.border},back:{marginRight:theme.spacing.md},title:{fontSize:theme.fontSize.xl,fontWeight:"700",color:theme.colors.textPrimary},content:{padding:theme.spacing.lg,gap:theme.spacing.lg},card:{backgroundColor:theme.colors.surface,borderRadius:theme.borderRadius.md,borderWidth:1,borderColor:theme.colors.border,padding:theme.spacing.lg},section:{fontSize:theme.fontSize.md,fontWeight:"700",color:theme.colors.textSecondary,marginBottom:8,textTransform:"uppercase"},row:{minHeight:52,flexDirection:"row",alignItems:"center",gap:12,borderBottomWidth:1,borderBottomColor:theme.colors.border},rowText:{flex:1,fontSize:theme.fontSize.md,fontWeight:"600",color:theme.colors.textPrimary}});
