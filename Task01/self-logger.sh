#!/bin/bash

DB_FILE="self_logger.db"
TABLE_NAME="launches"
USERNAME="${USER:-$(whoami)}"
CURRENT_DATE_TIME="$(date '+%Y-%m-%d %H:%M:%S')"

export LANG="en_US.UTF-8"

if [ ! -f "$DB_FILE" ]; then
    sqlite3 "$DB_FILE" "CREATE TABLE $TABLE_NAME (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user TEXT,
        launch_time TEXT
    );"
fi

sqlite3 "$DB_FILE" "INSERT INTO $TABLE_NAME (user, launch_time) VALUES ('$USERNAME', '$CURRENT_DATE_TIME');"

count=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM $TABLE_NAME;")
first_launch=$(sqlite3 "$DB_FILE" "SELECT launch_time FROM $TABLE_NAME ORDER BY launch_time ASC LIMIT 1;")

echo "Имя программы: self-logger.sh"
echo "Количество запусков: $count"
echo "Первый запуск: $first_launch"

echo ""
echo "---------------------------------------------"
echo "| User     | Date"
echo "---------------------------------------------"

sqlite3 "$DB_FILE" "SELECT user, launch_time FROM $TABLE_NAME;" | while read user time; do
    printf "| %s     | %s\n" "$user" "$time"
done

echo "---------------------------------------------"